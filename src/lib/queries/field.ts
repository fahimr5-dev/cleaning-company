import "server-only";
import { withUserRls } from "@/lib/rls";
import { clockStateOf, mapsLink } from "@/lib/field-ops";
import { startOfDay, addDays } from "@/lib/recurrence";
import type {
  FieldJobSummary, FieldJobDetail, FieldChecklistItem, FieldPhoto,
} from "@/lib/field-shared";
import { createSignedPhotoUrl } from "@/lib/storage";

/**
 * What the cleaner's phone is allowed to see.
 *
 * EVERY query here runs through `withUserRls`, which means the database itself
 * decides what comes back. If the code below asked for all 200 jobs, Postgres
 * would still hand over only the ones this cleaner's team is doing.
 */

/**
 * Joins address parts, dropping any that repeat something already there.
 *
 * A property's label and its address line often both mention the area, so a
 * naive join produces "Downtown Dubai, Dubai, Downtown Dubai".
 */
function joinDistinct(parts: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    // Skip anything already contained in what we have so far, and vice versa.
    if (seen.has(key)) continue;
    if (out.some((existing) => existing.toLowerCase().includes(key))) continue;
    seen.add(key);
    out.push(value);
  }
  return out.join(", ");
}

function summarise(job: JobRow, extras: {
  checklistTotal: number; checklistChecked: number; mandatoryOutstanding: number;
  photoCount: number; clockState: FieldJobSummary["clockState"];
}): FieldJobSummary {
  const p = job.property;
  const address = joinDistinct([p.buildingName, p.unitNumber, p.addressLine1, p.zone?.nameEn]);

  return {
    id: job.id,
    jobNo: job.jobNo,
    status: job.status,
    start: job.scheduledStart.toISOString(),
    end: job.scheduledEnd.toISOString(),
    durationMinutes: job.durationMinutes,
    clientName: job.client.companyName ?? job.client.contactName,
    serviceNameEn: job.serviceType.nameEn,
    serviceNameAr: job.serviceType.nameAr,
    propertyLabel: p.label,
    addressLine: address,
    zoneNameEn: p.zone?.nameEn ?? null,
    zoneNameAr: p.zone?.nameAr ?? null,
    mapsUrl: mapsLink({ latitude: p.latitude, longitude: p.longitude, address }),
    hasPets: p.hasPets,
    petNotes: p.petNotes,
    chemicalAllergies: p.chemicalAllergies,
    keyHeldByCompany: p.keyHeldByCompany,
    keyTag: p.keyTag,
    gateCode: p.gateCode,
    accessNotes: p.accessNotes,
    parkingNotes: p.parkingNotes,
    clientNotes: job.clientNotes,
    ...extras,
  };
}

const jobSelect = {
  id: true, jobNo: true, status: true, scheduledStart: true, scheduledEnd: true,
  durationMinutes: true, clientNotes: true,
  client: { select: { contactName: true, companyName: true } },
  serviceType: { select: { nameEn: true, nameAr: true } },
  property: {
    select: {
      label: true, buildingName: true, unitNumber: true, addressLine1: true,
      latitude: true, longitude: true, hasPets: true, petNotes: true,
      chemicalAllergies: true, keyHeldByCompany: true, keyTag: true,
      gateCode: true, accessNotes: true, parkingNotes: true,
      zone: { select: { nameEn: true, nameAr: true } },
    },
  },
} as const;

type JobRow = {
  id: string; jobNo: string; status: string; scheduledStart: Date; scheduledEnd: Date;
  durationMinutes: number; clientNotes: string | null;
  client: { contactName: string; companyName: string | null };
  serviceType: { nameEn: string; nameAr: string };
  property: {
    label: string; buildingName: string | null; unitNumber: string | null;
    addressLine1: string; latitude: number | null; longitude: number | null;
    hasPets: boolean; petNotes: string | null; chemicalAllergies: string | null;
    keyHeldByCompany: boolean; keyTag: string | null; gateCode: string | null;
    accessNotes: string | null; parkingNotes: string | null;
    zone: { nameEn: string; nameAr: string } | null;
  };
};

/** The cleaner's jobs for one day, newest information first. */
export async function getFieldDay(
  userId: string,
  staffId: string,
  day: Date,
): Promise<FieldJobSummary[]> {
  const from = startOfDay(day);
  const to = addDays(from, 1);

  return withUserRls(userId, async (tx) => {
    const jobs = (await tx.job.findMany({
      where: { deletedAt: null, scheduledStart: { gte: from, lt: to } },
      orderBy: { scheduledStart: "asc" },
      select: jobSelect,
    })) as unknown as JobRow[];

    if (jobs.length === 0) return [];
    const ids = jobs.map((j) => j.id);

    // One at a time, deliberately. A transaction holds a SINGLE database
    // connection, and a connection can only run one query at a time — firing
    // these off together makes the driver interleave them on one wire.
    const checklist = await tx.jobChecklistItem.findMany({
      where: { jobId: { in: ids } },
      select: { jobId: true, isChecked: true, isMandatory: true },
    });
    const photos = await tx.jobPhoto.groupBy({
      by: ["jobId"], where: { jobId: { in: ids }, deletedAt: null }, _count: true,
    });
    const timeEntries = await tx.timeEntry.findMany({
      where: { jobId: { in: ids }, staffId },
      select: { jobId: true, clockInAt: true, clockOutAt: true },
    });

    return jobs.map((job) => {
      const items = checklist.filter((c) => c.jobId === job.id);
      const entry = timeEntries.find((t) => t.jobId === job.id) ?? null;
      return summarise(job, {
        checklistTotal: items.length,
        checklistChecked: items.filter((i) => i.isChecked).length,
        mandatoryOutstanding: items.filter((i) => i.isMandatory && !i.isChecked).length,
        photoCount: photos.find((p) => p.jobId === job.id)?._count ?? 0,
        clockState: clockStateOf(entry),
      });
    });
  });
}

/** One job, with its checklist and photos. */
export async function getFieldJob(
  userId: string,
  staffId: string,
  jobId: string,
): Promise<FieldJobDetail | null> {
  const detail = await withUserRls(userId, async (tx) => {
    const job = (await tx.job.findFirst({
      where: { id: jobId, deletedAt: null },
      select: jobSelect,
    })) as unknown as JobRow | null;
    if (!job) return null;

    // Sequential, for the same reason as above: one connection, one query.
    const checklist = await tx.jobChecklistItem.findMany({
      where: { jobId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true, section: true, labelEn: true, labelAr: true,
        isMandatory: true, isChecked: true, sortOrder: true,
      },
    });
    const photos = await tx.jobPhoto.findMany({
      where: { jobId, deletedAt: null },
      orderBy: { takenAt: "asc" },
      select: { id: true, kind: true, storagePath: true, caption: true, takenAt: true },
    });
    const entry = await tx.timeEntry.findFirst({
      where: { jobId, staffId },
      orderBy: { clockInAt: "desc" },
      select: {
        clockInAt: true, clockOutAt: true, clockInFlagged: true, clockInDistanceM: true,
      },
    });

    return { job, checklist, photos, entry };
  });

  if (!detail) return null;
  const { job, checklist, photos, entry } = detail;

  // Signed links are created outside the restricted transaction because they
  // are a storage concern, not a database one.
  const withUrls: FieldPhoto[] = await Promise.all(
    (photos as { id: string; kind: string; storagePath: string; caption: string | null; takenAt: Date }[])
      .map(async (p) => ({
        id: p.id,
        kind: p.kind as FieldPhoto["kind"],
        storagePath: p.storagePath,
        caption: p.caption,
        takenAt: p.takenAt.toISOString(),
        signedUrl: await createSignedPhotoUrl(p.storagePath),
      })),
  );

  const items = checklist as FieldChecklistItem[];

  return {
    ...summarise(job, {
      checklistTotal: items.length,
      checklistChecked: items.filter((i) => i.isChecked).length,
      mandatoryOutstanding: items.filter((i) => i.isMandatory && !i.isChecked).length,
      photoCount: withUrls.length,
      clockState: clockStateOf(entry),
    }),
    checklist: items,
    photos: withUrls,
    clockInAt: entry?.clockInAt?.toISOString() ?? null,
    clockOutAt: entry?.clockOutAt?.toISOString() ?? null,
    clockInFlagged: entry?.clockInFlagged ?? false,
    clockInDistanceM: entry?.clockInDistanceM ?? null,
    latitude: job.property.latitude,
    longitude: job.property.longitude,
  };
}
