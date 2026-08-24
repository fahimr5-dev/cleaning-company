"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { checkLeaveRequest, leaveBalance, leaveDays } from "@/lib/hr";

/**
 * Approving leave, reviewing flagged hours, and keeping documents current.
 *
 * Running the rota is an operations job, so office roles can do most of this.
 * Anything touching pay is OWNER-only — and the database independently refuses
 * the salary columns to every signed-in session, whatever the app asks for.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/* --------------------------------- leave ---------------------------------- */

const leaveDecisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/**
 * Says yes or no to a leave request.
 *
 * Approving leave that covers scheduled jobs does NOT cancel them — it reports
 * how many there are so somebody re-crews them deliberately. Silently emptying
 * the diary would be far worse than saying it out loud.
 */
export async function decideLeaveAction(
  raw: unknown,
): Promise<Result<{ jobsAffected: number }>> {
  const parsed = leaveDecisionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { requestId, decision, note, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true, status: true, staffId: true, startDate: true, endDate: true,
      type: true, days: true,
      staff: { select: { firstName: true, lastName: true, employeeNo: true } },
    },
  });
  if (!request) return { ok: false, error: "That leave request no longer exists." };
  if (request.status !== "PENDING") {
    return { ok: false, error: `That request has already been ${request.status.toLowerCase()}.` };
  }

  const jobsAffected = decision === "APPROVED"
    ? await prisma.job.count({
        where: {
          deletedAt: null,
          status: { in: ["SCHEDULED", "EN_ROUTE"] },
          scheduledStart: { gte: request.startDate },
          scheduledEnd: { lte: endOfDay(request.endDate) },
          assignments: { some: { staffId: request.staffId } },
        },
      })
    : 0;

  await prisma.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: decision,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: note || null,
      },
    });

    // Someone away today should not read as available on the staff list.
    if (decision === "APPROVED" && coversToday(request.startDate, request.endDate)) {
      await tx.staff.update({
        where: { id: request.staffId },
        data: { employmentStatus: "ON_LEAVE" },
      });
    }
  });

  await recordAudit({
    action: decision === "APPROVED" ? "APPROVE" : "REJECT",
    entity: "LeaveRequest",
    entityId: requestId,
    summary:
      `${request.staff.employeeNo} ${request.staff.firstName} ${request.staff.lastName}: ` +
      `${request.days} days ${request.type.toLowerCase()} leave ${decision.toLowerCase()}` +
      (jobsAffected > 0 ? ` — ${jobsAffected} scheduled jobs need re-crewing` : ""),
  });

  revalidatePath(`/${locale}/staff`);
  revalidatePath(`/${locale}/staff/${request.staffId}`);
  return { ok: true, jobsAffected };
}

const leaveRequestSchema = z.object({
  staffId: z.string().uuid(),
  type: z.enum(["ANNUAL", "SICK", "UNPAID", "EMERGENCY", "MATERNITY", "HAJJ"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/** Books leave on somebody's behalf, with every warning stated up front. */
export async function createLeaveAction(
  raw: unknown,
): Promise<Result<{ requestId: string; warnings: string[] }>> {
  const parsed = leaveRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That leave request was not valid." };
  const { staffId, type, startDate, endDate, reason, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "Those dates were not valid." };
  }

  const person = await prisma.staff.findFirst({
    where: { id: staffId, deletedAt: null },
    select: {
      id: true, employeeNo: true, firstName: true, lastName: true,
      employmentStatus: true, annualLeaveDays: true,
      leaveRequests: { select: { type: true, days: true, status: true } },
    },
  });
  if (!person) return { ok: false, error: "That employee no longer exists." };

  const overlaps = await prisma.leaveRequest.count({
    where: {
      staffId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
  });

  const jobsInPeriod = await prisma.job.count({
    where: {
      deletedAt: null,
      status: { in: ["SCHEDULED", "EN_ROUTE"] },
      scheduledStart: { gte: start },
      scheduledEnd: { lte: endOfDay(end) },
      assignments: { some: { staffId } },
    },
  });

  const check = checkLeaveRequest({
    startDate: start,
    endDate: end,
    type,
    isEmployed: person.employmentStatus !== "TERMINATED",
    balance: leaveBalance({
      entitlementDays: person.annualLeaveDays,
      requests: person.leaveRequests,
    }),
    overlapsExisting: overlaps > 0,
    jobsInPeriod,
    coverageShortfalls: [],
  });

  if (!check.allowed) {
    const messages = {
      BACKWARDS_DATES: "The end date is before the start date.",
      OVERLAPS_EXISTING: "This overlaps leave they already have booked.",
      NOT_EMPLOYED: "That employee has left the company.",
    } as const;
    return { ok: false, error: messages[check.reason] };
  }

  const days = leaveDays(start, end);
  const created = await prisma.leaveRequest.create({
    data: {
      staffId, type, startDate: start, endDate: end, days,
      reason: reason || null, status: "PENDING",
    },
    select: { id: true },
  });

  await recordAudit({
    action: "CREATE",
    entity: "LeaveRequest",
    entityId: created.id,
    summary: `${person.employeeNo}: ${days} days ${type.toLowerCase()} leave requested`,
  });

  revalidatePath(`/${locale}/staff/${staffId}`);
  return {
    ok: true,
    requestId: created.id,
    warnings: check.warnings.map(describeWarning),
  };
}

function describeWarning(warning: { kind: string } & Record<string, unknown>): string {
  switch (warning.kind) {
    case "EXCEEDS_BALANCE":
      return `This is ${warning.requestedDays} days but only ${warning.remainingDays} are left of their annual entitlement.`;
    case "JOBS_SCHEDULED":
      return `${warning.jobCount} jobs are already booked with them in that period — they will need re-crewing.`;
    case "TEAM_LEFT_SHORT":
      return `On ${warning.date} their team would be down to ${warning.remainingCleaners} cleaners.`;
    default:
      return "Something about this request needs a second look.";
  }
}

/* ------------------------------- timesheets ------------------------------- */

const reviewSchema = z.object({
  entryId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/**
 * Signs off — or refuses — hours clocked outside the geofence.
 *
 * Until somebody decides, those minutes are not payable. That is the whole
 * point of the queue: unreviewed time must not quietly reach the payroll file.
 */
export async function reviewTimeEntryAction(raw: unknown): Promise<Result> {
  const parsed = reviewSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { entryId, decision, note, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const entry = await prisma.timeEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true, reviewStatus: true, staffId: true, minutesWorked: true,
      staff: { select: { employeeNo: true, firstName: true, lastName: true } },
    },
  });
  if (!entry) return { ok: false, error: "That timesheet entry no longer exists." };
  if (entry.reviewStatus !== "PENDING") {
    return { ok: false, error: "That entry has already been reviewed." };
  }

  await prisma.timeEntry.update({
    where: { id: entryId },
    data: {
      reviewStatus: decision,
      reviewedById: user.id,
      reviewedAt: new Date(),
      reviewNote: note || null,
    },
  });

  await recordAudit({
    action: decision === "APPROVED" ? "APPROVE" : "REJECT",
    entity: "TimeEntry",
    entityId: entryId,
    summary:
      `${entry.staff.employeeNo}: ${entry.minutesWorked ?? 0} minutes ` +
      `${decision === "APPROVED" ? "approved for pay" : "refused"}` +
      (note ? ` — ${note}` : ""),
  });

  revalidatePath(`/${locale}/staff`);
  revalidatePath(`/${locale}/staff/${entry.staffId}`);
  return { ok: true };
}

/* -------------------------------- documents ------------------------------- */

const documentSchema = z.object({
  staffId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
  type: z.enum([
    "PASSPORT", "VISA", "EMIRATES_ID", "MEDICAL_FITNESS",
    "LABOUR_CARD", "CONTRACT", "TRAINING_CERT", "OTHER",
  ]),
  number: z.string().trim().max(60).optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/**
 * Records or updates a legal document.
 *
 * Changing the expiry date clears the warnings already sent for it, so a
 * renewed visa starts its 60/30/7 countdown again from scratch.
 */
export async function saveStaffDocumentAction(
  raw: unknown,
): Promise<Result<{ documentId: string }>> {
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Those document details were not valid." };
  const { staffId, documentId, type, number, issuedAt, expiresAt, notes, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const person = await prisma.staff.findFirst({
    where: { id: staffId, deletedAt: null },
    select: { id: true, employeeNo: true },
  });
  if (!person) return { ok: false, error: "That employee no longer exists." };

  const data = {
    staffId,
    type,
    number: number || null,
    issuedAt: issuedAt ? new Date(issuedAt) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    notes: notes || null,
  };

  const saved = await prisma.$transaction(async (tx) => {
    if (documentId) {
      const existing = await tx.staffDocument.findUnique({
        where: { id: documentId },
        select: { expiresAt: true },
      });
      const updated = await tx.staffDocument.update({
        where: { id: documentId },
        data,
        select: { id: true },
      });

      // A renewed document must start its countdown again, or the next expiry
      // would pass in silence because "we already warned about this one".
      const changed = existing?.expiresAt?.getTime() !== data.expiresAt?.getTime();
      if (changed) {
        await tx.complianceAlert.deleteMany({ where: { staffDocumentId: documentId } });
      }
      return updated;
    }
    return tx.staffDocument.create({ data, select: { id: true } });
  });

  await recordAudit({
    action: documentId ? "UPDATE" : "CREATE",
    entity: "StaffDocument",
    entityId: saved.id,
    summary:
      `${person.employeeNo}: ${type.replace(/_/g, " ").toLowerCase()} ` +
      (data.expiresAt ? `expiring ${data.expiresAt.toISOString().slice(0, 10)}` : "recorded"),
  });

  revalidatePath(`/${locale}/staff`);
  revalidatePath(`/${locale}/staff/${staffId}`);
  return { ok: true, documentId: saved.id };
}

function endOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(23, 59, 59, 999);
  return out;
}

function coversToday(start: Date, end: Date): boolean {
  const now = Date.now();
  return start.getTime() <= now && endOfDay(end).getTime() >= now;
}
