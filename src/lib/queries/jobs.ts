import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { JobStatus } from "@/lib/schedule-shared";

/** The searchable job list, and the summary above it. */

export type JobListRow = {
  id: string;
  jobNo: string;
  clientId: string;
  clientName: string;
  serviceNameEn: string;
  serviceNameAr: string;
  teamName: string | null;
  teamNameAr: string | null;
  teamColor: string | null;
  zoneNameEn: string | null;
  zoneNameAr: string | null;
  scheduledStart: string;
  durationMinutes: number;
  status: JobStatus;
  totalFils: number;
  isRecurring: boolean;
  isLateCancellation: boolean;
  lateCancellationFeeFils: number;
};

export type JobListResult = {
  rows: JobListRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: {
    upcoming: number;
    completedThisMonth: number;
    cancelledThisMonth: number;
    revenueThisMonthFils: number;
  };
};

export async function getJobs(options: {
  search?: string;
  status?: string;
  teamId?: string;
  when?: "UPCOMING" | "PAST" | "ALL";
  page?: number;
  pageSize?: number;
}): Promise<JobListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25));
  const search = options.search?.trim();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const where: Prisma.JobWhereInput = {
    deletedAt: null,
    ...(options.status && options.status !== "ALL" ? { status: options.status as never } : {}),
    ...(options.teamId && options.teamId !== "ALL" ? { teamId: options.teamId } : {}),
    ...(options.when === "UPCOMING" ? { scheduledStart: { gte: now } } : {}),
    ...(options.when === "PAST" ? { scheduledStart: { lt: now } } : {}),
    ...(search
      ? {
          OR: [
            { jobNo: { contains: search, mode: "insensitive" } },
            { client: { contactName: { contains: search, mode: "insensitive" } } },
            { client: { companyName: { contains: search, mode: "insensitive" } } },
            { client: { phone: { contains: search } } },
          ],
        }
      : {}),
  };

  const [total, jobs, upcoming, completedThisMonth, cancelledThisMonth, revenue] =
    await Promise.all([
      prisma.job.count({ where }),
      prisma.job.findMany({
        where,
        orderBy: { scheduledStart: options.when === "PAST" ? "desc" : "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, jobNo: true, clientId: true, scheduledStart: true,
          durationMinutes: true, status: true, totalFils: true, seriesId: true,
          isLateCancellation: true, lateCancellationFeeFils: true,
          client: { select: { contactName: true, companyName: true } },
          serviceType: { select: { nameEn: true, nameAr: true } },
          team: { select: { name: true, nameAr: true, colorHex: true } },
          property: { select: { zone: { select: { nameEn: true, nameAr: true } } } },
        },
      }),
      prisma.job.count({
        where: { deletedAt: null, scheduledStart: { gte: now }, status: { in: ["SCHEDULED", "EN_ROUTE"] } },
      }),
      prisma.job.count({
        where: { deletedAt: null, status: "COMPLETED", scheduledStart: { gte: monthStart } },
      }),
      prisma.job.count({
        where: { deletedAt: null, status: "CANCELLED", scheduledStart: { gte: monthStart } },
      }),
      prisma.job.aggregate({
        where: { deletedAt: null, status: "COMPLETED", scheduledStart: { gte: monthStart } },
        _sum: { totalFils: true },
      }),
    ]);

  return {
    total,
    page,
    pageSize,
    summary: {
      upcoming,
      completedThisMonth,
      cancelledThisMonth,
      revenueThisMonthFils: revenue._sum?.totalFils ?? 0,
    },
    rows: jobs.map((j) => ({
      id: j.id,
      jobNo: j.jobNo,
      clientId: j.clientId,
      clientName: j.client.companyName ?? j.client.contactName,
      serviceNameEn: j.serviceType.nameEn,
      serviceNameAr: j.serviceType.nameAr,
      teamName: j.team?.name ?? null,
      teamNameAr: j.team?.nameAr ?? null,
      teamColor: j.team?.colorHex ?? null,
      zoneNameEn: j.property.zone?.nameEn ?? null,
      zoneNameAr: j.property.zone?.nameAr ?? null,
      scheduledStart: j.scheduledStart.toISOString(),
      durationMinutes: j.durationMinutes,
      status: j.status as JobStatus,
      totalFils: j.totalFils,
      isRecurring: Boolean(j.seriesId),
      isLateCancellation: j.isLateCancellation,
      lateCancellationFeeFils: j.lateCancellationFeeFils,
    })),
  };
}

/** Every active repeating booking, for the panel on the jobs page. */
export async function getRecurringSeries() {
  const series = await prisma.recurringSeries.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "PAUSED"] } },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, contactName: true, companyName: true, isBookingPaused: true } },
      serviceType: { select: { nameEn: true, nameAr: true } },
      team: { select: { name: true, nameAr: true, colorHex: true } },
      _count: { select: { jobs: { where: { deletedAt: null, status: "SCHEDULED" } } } },
    },
  });

  return series.map((s) => ({
    id: s.id,
    clientId: s.client.id,
    clientName: s.client.companyName ?? s.client.contactName,
    clientPaused: s.client.isBookingPaused,
    serviceNameEn: s.serviceType.nameEn,
    serviceNameAr: s.serviceType.nameAr,
    teamName: s.team?.name ?? null,
    teamNameAr: s.team?.nameAr ?? null,
    teamColor: s.team?.colorHex ?? null,
    frequency: s.frequency,
    interval: s.interval,
    daysOfWeek: s.daysOfWeek,
    timeOfDay: s.timeOfDay,
    status: s.status,
    priceFils: s.priceFils,
    upcomingCount: s._count.jobs,
    generatedUntil: s.generatedUntil?.toISOString() ?? null,
  }));
}

export type SeriesRow = Awaited<ReturnType<typeof getRecurringSeries>>[number];
