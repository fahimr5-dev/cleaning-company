"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { recordAudit, auditFields } from "@/lib/audit";
import { checkJobPlacement } from "@/lib/queries/schedule";
import { assessCancellation, blockingConflicts, type Conflict } from "@/lib/scheduling";
import { generateOccurrences, addDays, startOfDay } from "@/lib/recurrence";
import { nextDocumentNumber } from "@/lib/document-number";

/**
 * Everything that changes the diary.
 *
 * A blocking conflict (the team is literally in two places at once) is refused.
 * A warning (a tight drive across town) is returned to the screen so the
 * manager can decide — they know about the traffic, we do not.
 */

type Result<T = unknown> =
  | ({ ok: true; warnings: Conflict[] } & T)
  | { ok: false; error: string; conflicts?: Conflict[] };

const moveSchema = z.object({
  jobId: z.string().uuid(),
  teamId: z.string().uuid(),
  /** ISO date-time of the new start. */
  start: z.string().datetime(),
  /** Set once the manager has seen the warnings and still wants to proceed. */
  acceptWarnings: z.boolean().default(false),
  locale: z.string().max(5).default("en"),
});

export async function moveJobAction(raw: unknown): Promise<Result<{ jobId: string }>> {
  const parsed = moveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That move was not valid." };
  const { jobId, teamId, start, acceptWarnings, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const job = await prisma.job.findFirst({
    where: { id: jobId, deletedAt: null },
    select: {
      id: true, jobNo: true, teamId: true, status: true, durationMinutes: true,
      scheduledStart: true, scheduledEnd: true,
    },
  });
  if (!job) return { ok: false, error: "That job no longer exists." };

  if (job.status === "COMPLETED" || job.status === "CANCELLED") {
    return { ok: false, error: "A completed or cancelled job cannot be moved." };
  }

  const newStart = new Date(start);
  const conflicts = (await checkJobPlacement({ jobId, teamId, start: newStart })) ?? [];
  const blocking = blockingConflicts(conflicts);

  if (blocking.length > 0) {
    return {
      ok: false,
      error: "That team is already on another job at that time.",
      conflicts,
    };
  }

  const warnings = conflicts.filter((c) => c.severity === "WARN");
  if (warnings.length > 0 && !acceptWarnings) {
    // Not an error — the screen shows these and asks the manager to confirm.
    return { ok: false, error: "NEEDS_CONFIRMATION", conflicts: warnings };
  }

  const newEnd = new Date(newStart.getTime() + job.durationMinutes * 60_000);

  await prisma.job.update({
    where: { id: jobId },
    data: { teamId, scheduledStart: newStart, scheduledEnd: newEnd },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Job",
    entityId: jobId,
    summary: `Moved job ${job.jobNo} to ${newStart.toISOString().slice(0, 16).replace("T", " ")}`,
    before: auditFields(job, ["teamId", "scheduledStart", "scheduledEnd"]),
    after: { teamId, scheduledStart: newStart.toISOString(), scheduledEnd: newEnd.toISOString() },
  });

  revalidatePath(`/${locale}/schedule`);
  revalidatePath(`/${locale}/jobs`);
  return { ok: true, jobId, warnings };
}

const cancelSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().trim().min(1, "Please give a reason.").max(500),
  /** Cancel just this visit, or end the whole repeating booking. */
  scope: z.enum(["THIS", "SERIES"]).default("THIS"),
  chargeFee: z.boolean().default(true),
  locale: z.string().max(5).default("en"),
});

export type CancelPreview = {
  isLate: boolean;
  hoursNotice: number;
  feeFils: number;
  jobNo: string;
  isRecurring: boolean;
};

/** Tells the screen what cancelling would cost, WITHOUT cancelling anything. */
export async function previewCancellationAction(
  jobId: string,
  locale = "en",
): Promise<CancelPreview | null> {
  await requireRole(locale, ...OFFICE_ROLES);

  const [job, org] = await Promise.all([
    prisma.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: { id: true, jobNo: true, scheduledStart: true, totalFils: true, seriesId: true },
    }),
    prisma.organization.findFirst(),
  ]);
  if (!job || !org) return null;

  const outcome = assessCancellation({
    jobStart: job.scheduledStart,
    now: new Date(),
    jobPriceFils: job.totalFils,
    policy: {
      cutoffHours: org.rescheduleCutoffHours,
      feeBps: org.lateCancellationFeeBps,
      feeFlatFils: org.lateCancellationFeeFlatFils,
    },
  });

  return {
    isLate: outcome.isLate,
    hoursNotice: Math.round(outcome.hoursNotice),
    feeFils: outcome.feeFils,
    jobNo: job.jobNo,
    isRecurring: Boolean(job.seriesId),
  };
}

export async function cancelJobAction(raw: unknown): Promise<Result> {
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That request was not valid." };
  }
  const { jobId, reason, scope, chargeFee, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const [job, org] = await Promise.all([
    prisma.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: {
        id: true, jobNo: true, status: true, scheduledStart: true,
        totalFils: true, seriesId: true,
      },
    }),
    prisma.organization.findFirst(),
  ]);
  if (!job || !org) return { ok: false, error: "That job no longer exists." };
  if (job.status === "COMPLETED") {
    return { ok: false, error: "A completed job cannot be cancelled. Raise a credit note instead." };
  }

  const outcome = assessCancellation({
    jobStart: job.scheduledStart,
    now: new Date(),
    jobPriceFils: job.totalFils,
    policy: {
      cutoffHours: org.rescheduleCutoffHours,
      feeBps: org.lateCancellationFeeBps,
      feeFlatFils: org.lateCancellationFeeFlatFils,
    },
  });
  const feeFils = chargeFee ? outcome.feeFils : 0;

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancellationReason: reason,
        isLateCancellation: outcome.isLate,
        lateCancellationFeeFils: feeFils,
      },
    });

    // "Cancel the series" ends future visits but never rewrites history: past
    // and in-progress visits are left exactly as they were.
    if (scope === "SERIES" && job.seriesId) {
      await tx.recurringSeries.update({
        where: { id: job.seriesId },
        data: { status: "ENDED", endDate: startOfDay(new Date()) },
      });
      await tx.job.updateMany({
        where: {
          seriesId: job.seriesId,
          deletedAt: null,
          status: "SCHEDULED",
          scheduledStart: { gt: new Date() },
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancellationReason: `Series ended: ${reason}`,
        },
      });
    }
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Job",
    entityId: jobId,
    summary:
      `Cancelled job ${job.jobNo}${scope === "SERIES" ? " and ended the series" : ""}` +
      (feeFils > 0 ? ` with a late fee of ${feeFils} fils` : ""),
    before: { status: job.status },
    after: { status: "CANCELLED", reason, lateFeeFils: feeFils, scope },
  });

  revalidatePath(`/${locale}/schedule`);
  revalidatePath(`/${locale}/jobs`);
  return { ok: true, warnings: [] };
}

const skipSchema = z.object({
  jobId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/**
 * Skips ONE visit of a repeating booking.
 *
 * PLAIN ENGLISH: the client is away this Tuesday but wants the following one as
 * normal. The visit is cancelled; the series is untouched.
 */
export async function skipOccurrenceAction(raw: unknown): Promise<Result> {
  const parsed = skipSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { jobId, reason, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const job = await prisma.job.findFirst({
    where: { id: jobId, deletedAt: null },
    select: { id: true, jobNo: true, status: true, seriesId: true },
  });
  if (!job) return { ok: false, error: "That job no longer exists." };
  if (!job.seriesId) {
    return { ok: false, error: "This is a one-off booking, so there is no series to skip." };
  }
  if (job.status !== "SCHEDULED") {
    return { ok: false, error: "Only a visit that has not started yet can be skipped." };
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById: user.id,
      cancellationReason: reason ?? "Skipped this visit",
      isLateCancellation: false,
      lateCancellationFeeFils: 0,
    },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Job",
    entityId: jobId,
    summary: `Skipped one visit of a repeating booking (${job.jobNo}); the series continues`,
    after: { status: "CANCELLED", skipped: true },
  });

  revalidatePath(`/${locale}/schedule`);
  revalidatePath(`/${locale}/jobs`);
  return { ok: true, warnings: [] };
}

const generateSchema = z.object({
  seriesId: z.string().uuid().optional(),
  /** How many days ahead to fill in. */
  horizonDays: z.coerce.number().int().min(7).max(180).default(60),
  locale: z.string().max(5).default("en"),
});

export type GenerateOutcome = {
  ok: true;
  created: number;
  seriesProcessed: number;
  skippedForConflict: number;
};

/**
 * Fills the diary forward from every active repeating booking.
 *
 * Safe to run as often as you like: a visit that already exists is never
 * created twice.
 */
export async function generateSeriesJobsAction(
  raw: unknown,
): Promise<GenerateOutcome | { ok: false; error: string }> {
  const parsed = generateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { seriesId, horizonDays, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const org = await prisma.organization.findFirst();
  const weekendDays = org?.weekendDays ?? [5, 6];

  const seriesList = await prisma.recurringSeries.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      ...(seriesId ? { id: seriesId } : {}),
    },
    include: {
      client: { select: { id: true, isBookingPaused: true } },
      jobs: {
        where: { deletedAt: null },
        select: { scheduledStart: true },
      },
    },
  });

  const from = startOfDay(new Date());
  const until = addDays(from, horizonDays);

  let created = 0;
  let skippedForConflict = 0;

  for (const series of seriesList) {
    // A client paused for non-payment should not keep accruing visits.
    if (series.client.isBookingPaused) continue;

    const occurrences = generateOccurrences(
      {
        frequency: series.frequency,
        interval: series.interval,
        daysOfWeek: series.daysOfWeek,
        startDate: series.startDate,
        endDate: series.endDate,
        occurrenceLimit: series.occurrenceLimit,
        timeOfDay: series.timeOfDay,
        durationMinutes: series.durationMinutes,
      },
      {
        from,
        until,
        existing: series.jobs.map((j) => j.scheduledStart),
        weekendDays,
        onWeekend: "next",
        maxOccurrences: 60,
      },
    );

    for (const occurrence of occurrences) {
      // Never double-book a team by generating on top of an existing job.
      if (series.teamId) {
        const clash = await prisma.job.count({
          where: {
            deletedAt: null,
            teamId: series.teamId,
            status: { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"] },
            scheduledStart: { lt: occurrence.end },
            scheduledEnd: { gt: occurrence.start },
          },
        });
        if (clash > 0) {
          skippedForConflict += 1;
          continue;
        }
      }

      await prisma.$transaction(async (tx) => {
        const jobNo = await nextDocumentNumber(tx, "JOB");
        const vatFils = Math.round((series.priceFils * (org?.vatRateBps ?? 500)) / 10000);
        await tx.job.create({
          data: {
            jobNo,
            clientId: series.clientId,
            propertyId: series.propertyId,
            serviceTypeId: series.serviceTypeId,
            teamId: series.teamId,
            seriesId: series.id,
            occurrenceIndex: occurrence.index,
            status: "SCHEDULED",
            scheduledStart: occurrence.start,
            scheduledEnd: occurrence.end,
            durationMinutes: series.durationMinutes,
            cleanersRequired: series.cleanersRequired,
            subtotalFils: series.priceFils,
            vatRateBps: org?.vatRateBps ?? 500,
            vatFils,
            totalFils: series.priceFils + vatFils,
          },
        });
      });
      created += 1;
    }

    await prisma.recurringSeries.update({
      where: { id: series.id },
      data: { generatedUntil: until },
    });
  }

  if (created > 0 || skippedForConflict > 0) {
    await recordAudit({
      action: "CREATE",
      entity: "RecurringSeries",
      entityId: seriesId ?? "ALL",
      summary: `Generated ${created} visits from ${seriesList.length} repeating bookings` +
        (skippedForConflict > 0 ? `; skipped ${skippedForConflict} that would have clashed` : ""),
    });
  }

  revalidatePath(`/${locale}/schedule`);
  revalidatePath(`/${locale}/jobs`);
  return { ok: true, created, seriesProcessed: seriesList.length, skippedForConflict };
}

const seriesStatusSchema = z.object({
  seriesId: z.string().uuid(),
  status: z.enum(["ACTIVE", "PAUSED", "ENDED"]),
  locale: z.string().max(5).default("en"),
});

export async function setSeriesStatusAction(raw: unknown): Promise<Result> {
  const parsed = seriesStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { seriesId, status, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const series = await prisma.recurringSeries.findFirst({
    where: { id: seriesId, deletedAt: null },
    select: { id: true, status: true, client: { select: { clientNo: true } } },
  });
  if (!series) return { ok: false, error: "That repeating booking no longer exists." };

  await prisma.recurringSeries.update({ where: { id: seriesId }, data: { status } });

  await recordAudit({
    action: "UPDATE",
    entity: "RecurringSeries",
    entityId: seriesId,
    summary: `Repeating booking for ${series.client.clientNo} set to ${status}`,
    before: { status: series.status },
    after: { status },
  });

  revalidatePath(`/${locale}/schedule`);
  return { ok: true, warnings: [] };
}
