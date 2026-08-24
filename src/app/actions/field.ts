"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withUserRls } from "@/lib/rls";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-number";
import { checkGeofence, canCompleteJob, minutesWorked } from "@/lib/field-ops";
import { uploadJobPhoto, isStorageConfigured } from "@/lib/storage";
import { billCompletedJob } from "@/lib/invoicing";
import { prepareRatingRequest } from "@/lib/ratings";
import { qualifyReferralForJob } from "@/lib/referrals";
import { ISSUE_TYPES } from "@/lib/field-shared";

/**
 * Everything the cleaner's phone can do.
 *
 * Two locks, as everywhere: `requireRole` checks the person is a cleaner, and
 * every database call runs through `withUserRls`, so Postgres independently
 * refuses anything to do with somebody else's job.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Confirms the caller is a cleaner and finds their employee record. */
async function requireCleaner(locale: string) {
  const user = await requireRole(locale, "CLEANER");
  if (!user.staffId) {
    return { user, staffId: null as string | null };
  }
  return { user, staffId: user.staffId };
}

const coordinates = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  accuracyMetres: z.coerce.number().min(0).max(100000).optional().nullable(),
});

const clockInSchema = z.object({
  jobId: z.string().uuid(),
  position: coordinates.nullable().optional(),
  locale: z.string().max(5).default("en"),
});

export type ClockResult = Result<{
  flagged: boolean;
  distanceMetres: number | null;
  reason: string;
}>;

/**
 * Starts the shift on a job.
 *
 * A clock-in outside the geofence is FLAGGED, never refused — see the note in
 * `src/lib/field-ops.ts` for why.
 */
export async function clockInAction(raw: unknown): Promise<ClockResult> {
  const parsed = clockInSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { jobId, position, locale } = parsed.data;

  const { user, staffId } = await requireCleaner(locale);
  if (!staffId) return { ok: false, error: "Your login is not linked to an employee record yet." };

  const org = await prisma.organization.findFirst({
    select: { geofenceRadiusMeters: true },
  });

  return withUserRls(user.id, async (tx) => {
    const job = await tx.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: {
        id: true, jobNo: true, status: true,
        property: { select: { latitude: true, longitude: true } },
      },
    });
    // Either the job does not exist, or it is not this cleaner's — the database
    // gives the same answer to both, which is exactly what we want.
    if (!job) return { ok: false as const, error: "That job is not on your list." };

    if (job.status === "COMPLETED" || job.status === "CANCELLED") {
      return { ok: false as const, error: "That job is already closed." };
    }

    const existing = await tx.timeEntry.findFirst({
      where: { jobId, staffId, clockOutAt: null },
      select: { id: true },
    });
    if (existing) return { ok: false as const, error: "You are already clocked in on this job." };

    const geo = checkGeofence({
      property:
        job.property.latitude !== null && job.property.longitude !== null
          ? { latitude: job.property.latitude, longitude: job.property.longitude }
          : null,
      device: position ? { latitude: position.latitude, longitude: position.longitude } : null,
      accuracyMetres: position?.accuracyMetres ?? null,
      radiusMetres: org?.geofenceRadiusMeters ?? 200,
    });

    await tx.timeEntry.create({
      data: {
        staffId,
        jobId,
        clockInAt: new Date(),
        clockInLat: position?.latitude ?? null,
        clockInLng: position?.longitude ?? null,
        clockInAccuracyM: position?.accuracyMetres ? Math.round(position.accuracyMetres) : null,
        clockInDistanceM: geo.distanceMetres,
        clockInFlagged: geo.flagged,
        source: "MOBILE",
        reviewStatus: geo.flagged ? "PENDING" : "NOT_REQUIRED",
      },
    });

    // Arriving on site moves the job along by itself, so nobody has to
    // remember to also press "in progress".
    if (job.status === "SCHEDULED" || job.status === "EN_ROUTE") {
      await tx.job.update({
        where: { id: jobId },
        data: { status: "IN_PROGRESS", actualStart: new Date() },
      });
    }

    return {
      ok: true as const,
      flagged: geo.flagged,
      distanceMetres: geo.distanceMetres,
      reason: geo.reason,
    };
  }).then(async (result) => {
    if (result.ok) {
      revalidatePath(`/${locale}/field`);
      revalidatePath(`/${locale}/field/${jobId}`);
    }
    return result;
  });
}

const clockOutSchema = clockInSchema;

export async function clockOutAction(raw: unknown): Promise<ClockResult> {
  const parsed = clockOutSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { jobId, position, locale } = parsed.data;

  const { user, staffId } = await requireCleaner(locale);
  if (!staffId) return { ok: false, error: "Your login is not linked to an employee record yet." };

  const org = await prisma.organization.findFirst({ select: { geofenceRadiusMeters: true } });

  const result = await withUserRls(user.id, async (tx) => {
    const entry = await tx.timeEntry.findFirst({
      where: { jobId, staffId, clockOutAt: null },
      orderBy: { clockInAt: "desc" },
      select: { id: true, clockInAt: true },
    });
    if (!entry) return { ok: false as const, error: "You are not clocked in on this job." };

    const job = await tx.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: { property: { select: { latitude: true, longitude: true } } },
    });

    const geo = checkGeofence({
      property:
        job?.property.latitude != null && job?.property.longitude != null
          ? { latitude: job.property.latitude, longitude: job.property.longitude }
          : null,
      device: position ? { latitude: position.latitude, longitude: position.longitude } : null,
      accuracyMetres: position?.accuracyMetres ?? null,
      radiusMetres: org?.geofenceRadiusMeters ?? 200,
    });

    const now = new Date();
    await tx.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockOutAt: now,
        clockOutLat: position?.latitude ?? null,
        clockOutLng: position?.longitude ?? null,
        clockOutAccuracyM: position?.accuracyMetres ? Math.round(position.accuracyMetres) : null,
        clockOutDistanceM: geo.distanceMetres,
        clockOutFlagged: geo.flagged,
        minutesWorked: minutesWorked(entry.clockInAt, now),
      },
    });

    return {
      ok: true as const,
      flagged: geo.flagged,
      distanceMetres: geo.distanceMetres,
      reason: geo.reason,
    };
  });

  if (result.ok) {
    revalidatePath(`/${locale}/field`);
    revalidatePath(`/${locale}/field/${jobId}`);
  }
  return result;
}

const toggleSchema = z.object({
  itemId: z.string().uuid(),
  jobId: z.string().uuid(),
  isChecked: z.boolean(),
  locale: z.string().max(5).default("en"),
});

export async function toggleChecklistItemAction(raw: unknown): Promise<Result> {
  const parsed = toggleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { itemId, jobId, isChecked, locale } = parsed.data;

  const { user, staffId } = await requireCleaner(locale);
  if (!staffId) return { ok: false, error: "Your login is not linked to an employee record yet." };

  const result = await withUserRls(user.id, async (tx) => {
    // updateMany, not update: it returns a count, so a row the rules refuse to
    // let us touch is visibly zero rather than a silent success.
    const changed = await tx.jobChecklistItem.updateMany({
      where: { id: itemId, jobId },
      data: {
        isChecked,
        checkedAt: isChecked ? new Date() : null,
        checkedByStaffId: isChecked ? staffId : null,
      },
    });
    if (changed.count === 0) {
      return { ok: false as const, error: "That checklist item is not on one of your jobs." };
    }
    return { ok: true as const };
  });

  if (result.ok) revalidatePath(`/${locale}/field/${jobId}`);
  return result;
}

const completeSchema = z.object({
  jobId: z.string().uuid(),
  locale: z.string().max(5).default("en"),
});

/**
 * Marks a job finished — but only if every mandatory checklist item is ticked.
 * This is the rule enforced on the server, not just hidden in the interface.
 */
export async function completeJobAction(raw: unknown): Promise<Result<{ warning?: string }>> {
  const parsed = completeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { jobId, locale } = parsed.data;

  const { user, staffId } = await requireCleaner(locale);
  if (!staffId) return { ok: false, error: "Your login is not linked to an employee record yet." };

  const result = await withUserRls(user.id, async (tx) => {
    const job = await tx.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: { id: true, jobNo: true, status: true },
    });
    if (!job) return { ok: false as const, error: "That job is not on your list." };

    const items = await tx.jobChecklistItem.findMany({
      where: { jobId },
      select: { id: true, isMandatory: true, isChecked: true, labelEn: true },
    });

    const verdict = canCompleteJob({ status: job.status, items });
    if (!verdict.canComplete) {
      const messages: Record<string, string> = {
        MANDATORY_INCOMPLETE: `Tick the ${verdict.outstandingMandatory.length} remaining required item(s) first.`,
        NOT_STARTED: "Clock in before finishing the job.",
        ALREADY_DONE: "This job is already finished.",
        WRONG_STATUS: "This job cannot be finished.",
      };
      return { ok: false as const, error: messages[verdict.reason ?? ""] ?? "This job cannot be finished yet." };
    }

    await tx.job.update({
      where: { id: jobId },
      data: { status: "COMPLETED", actualEnd: new Date() },
    });

    // Close any open timesheet so the shift does not run on for ever.
    const open = await tx.timeEntry.findFirst({
      where: { jobId, staffId, clockOutAt: null },
      select: { id: true, clockInAt: true },
    });
    if (open) {
      const now = new Date();
      await tx.timeEntry.update({
        where: { id: open.id },
        data: { clockOutAt: now, minutesWorked: minutesWorked(open.clockInAt, now) },
      });
    }

    const photos = await tx.jobPhoto.count({ where: { jobId, deletedAt: null } });
    return {
      ok: true as const,
      jobNo: job.jobNo,
      warning: photos === 0 ? "NO_PHOTOS" : undefined,
    };
  });

  if (result.ok) {
    await recordAudit({
      action: "UPDATE",
      entity: "Job",
      entityId: jobId,
      summary: `Job ${result.jobNo} marked complete from the field`,
      after: { status: "COMPLETED" },
    });

    // Finishing a job is what triggers billing: a prepaid session is used, an
    // invoice is raised, or it waits for the month-end run — depending on the
    // client's settings. A billing failure must never lose the completed job,
    // so it is logged loudly rather than thrown.
    try {
      const outcome = await billCompletedJob(jobId);
      if (outcome.kind === "INVOICED") {
        await recordAudit({
          action: "CREATE",
          entity: "Invoice",
          entityId: outcome.invoiceId,
          summary: `Invoice ${outcome.invoiceNo} raised automatically for job ${result.jobNo}`,
        });
      }
    } catch (error) {
      console.error(
        `\n!! BILLING FAILED for completed job ${result.jobNo}. The job IS saved as` +
          " complete; it simply has no invoice yet. Raise one by hand from the" +
          " Invoices screen.\n",
        error,
      );
    }

    // Prepare the "how did we do?" request. It is not sent yet — the message
    // goes out once the delay in your settings has passed.
    try {
      await prepareRatingRequest(jobId);
    } catch (error) {
      console.error(
        `\n!! Could not prepare the rating request for ${result.jobNo}. The job IS` +
          " saved as complete; it simply will not be rated.\n",
        error,
      );
    }

    // If this client arrived through somebody's referral code, a completed and
    // paid first job is what earns both of them their reward.
    try {
      await qualifyReferralForJob(jobId);
    } catch (error) {
      console.error(
        `\n!! Could not check the referral on ${result.jobNo}. The job IS saved as` +
          " complete; a reward may need issuing by hand from the Retention screen.\n",
        error,
      );
    }

    revalidatePath(`/${locale}/field`);
    revalidatePath(`/${locale}/field/${jobId}`);
    revalidatePath(`/${locale}/invoices`);
  }
  return result;
}

const issueSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum(ISSUE_TYPES),
  subject: z.string().trim().min(3, "Say briefly what happened.").max(200),
  description: z.string().trim().min(1, "Add a little detail.").max(2000),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
  locale: z.string().max(5).default("en"),
});

/**
 * Reports a problem from site. Lands in the Ops Manager's queue immediately.
 * "No access" also puts the job into the no-access state so the office can see
 * at a glance that nobody got in.
 */
export async function reportIssueAction(raw: unknown): Promise<Result<{ ticketNo: string }>> {
  const parsed = issueSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That request was not valid." };
  }
  const { jobId, type, subject, description, severity, locale } = parsed.data;

  const { user, staffId } = await requireCleaner(locale);
  if (!staffId) return { ok: false, error: "Your login is not linked to an employee record yet." };

  // Confirm the job really is this cleaner's, under the database's own rules.
  const job = await withUserRls(user.id, (tx) =>
    tx.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: { id: true, jobNo: true, clientId: true, status: true },
    }),
  );
  if (!job) return { ok: false, error: "That job is not on your list." };

  // The ticket itself is written with full privileges: a cleaner is not
  // permitted to set a ticket's client or severity directly, but they ARE
  // permitted to raise one about their own job, which we have just proved.
  const ticket = await prisma.$transaction(async (tx) => {
    const ticketNo = await nextDocumentNumber(tx, "TKT");
    const created = await tx.ticket.create({
      data: {
        ticketNo,
        type,
        severity: type === "DAMAGE" ? "HIGH" : severity,
        status: "OPEN",
        jobId,
        clientId: job.clientId,
        raisedByStaffId: staffId,
        raisedByUserId: user.id,
        subject,
        description,
      },
    });

    if (type === "NO_ACCESS" && job.status !== "COMPLETED") {
      await tx.job.update({
        where: { id: jobId },
        data: { status: "NO_ACCESS", noAccessNote: description },
      });
    }
    return created;
  });

  await recordAudit({
    action: "CREATE",
    entity: "Ticket",
    entityId: ticket.id,
    summary: `${ticket.ticketNo} raised from site on job ${job.jobNo}: ${subject}`,
    after: { type, severity: ticket.severity, jobNo: job.jobNo },
  });

  revalidatePath(`/${locale}/field`);
  revalidatePath(`/${locale}/field/${jobId}`);
  return { ok: true, ticketNo: ticket.ticketNo };
}

const photoSchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(["BEFORE", "AFTER", "ISSUE"]),
  fileName: z.string().max(200),
  contentType: z.string().max(80),
  caption: z.string().trim().max(200).optional(),
  roomLabel: z.string().trim().max(80).optional(),
  /** The compressed image, base64-encoded by the phone. */
  dataBase64: z.string().min(16).max(12_000_000),
  locale: z.string().max(5).default("en"),
});

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function uploadJobPhotoAction(raw: unknown): Promise<Result<{ photoId: string }>> {
  const parsed = photoSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That photo could not be read." };
  }
  const { jobId, kind, fileName, contentType, caption, roomLabel, dataBase64, locale } = parsed.data;

  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return { ok: false, error: "Photos must be JPEG, PNG or WebP." };
  }
  if (!isStorageConfigured()) {
    return {
      ok: false,
      error: "Photo storage is not set up yet. Everything else on this job still works.",
    };
  }

  const { user, staffId } = await requireCleaner(locale);
  if (!staffId) return { ok: false, error: "Your login is not linked to an employee record yet." };

  const job = await withUserRls(user.id, (tx) =>
    tx.job.findFirst({ where: { id: jobId, deletedAt: null }, select: { id: true, jobNo: true } }),
  );
  if (!job) return { ok: false, error: "That job is not on your list." };

  const body = Buffer.from(dataBase64, "base64");
  if (body.byteLength === 0) return { ok: false, error: "That photo was empty." };
  if (body.byteLength > 10 * 1024 * 1024) {
    return { ok: false, error: "That photo is too large even after compression." };
  }

  const upload = await uploadJobPhoto({
    jobId,
    fileName,
    contentType,
    body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
  });
  if (!upload.ok) return { ok: false, error: upload.error };

  // The database row is only written AFTER the file is safely stored, so there
  // is never a photo record pointing at nothing.
  const photo = await prisma.jobPhoto.create({
    data: {
      jobId,
      kind,
      storagePath: upload.storagePath,
      caption: caption || null,
      roomLabel: roomLabel || null,
      takenByStaffId: staffId,
      sizeBytes: body.byteLength,
      isVisibleToClient: kind !== "ISSUE",
    },
    select: { id: true },
  });

  revalidatePath(`/${locale}/field/${jobId}`);
  return { ok: true, photoId: photo.id };
}
