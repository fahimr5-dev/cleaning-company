import type { JobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Everything the dashboard shows, fetched in one place.
 *
 * PLAIN ENGLISH: these are real counts from your real data — no invented
 * numbers anywhere. All the queries are fired at once rather than one after
 * another, which is why the page loads quickly even with 200 jobs in it.
 *
 * This runs on the server AFTER `requireRole` has confirmed the person is
 * office staff, which is why it may use the owner-level database connection.
 */

export type UtilisationRow = {
  teamId: string;
  name: string;
  nameAr: string | null;
  colorHex: string;
  bookedMinutes: number;
  capacityMinutes: number;
  percent: number;
};

export type UpcomingJob = {
  id: string;
  scheduledStart: Date;
  status: string;
  clientName: string;
  serviceNameEn: string;
  serviceNameAr: string;
  zoneNameEn: string | null;
  zoneNameAr: string | null;
  teamName: string | null;
  teamNameAr: string | null;
};

export async function getDashboardData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const in60Days = new Date(today);
  in60Days.setDate(in60Days.getDate() + 60);

  const activeJobStatuses: JobStatus[] = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"];

  const [
    jobsToday,
    activeClients,
    commercialClients,
    openLeads,
    unpaidInvoices,
    outstanding,
    overdueInvoices,
    openTickets,
    flaggedClockIns,
    expiringDocuments,
    lowStockItems,
    teams,
    todaysJobsForUtilisation,
    upcoming,
  ] = await Promise.all([
    prisma.job.count({
      where: { deletedAt: null, scheduledStart: { gte: today, lt: tomorrow } },
    }),
    prisma.client.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.client.count({ where: { deletedAt: null, status: "ACTIVE", type: "COMMERCIAL" } }),
    prisma.lead.count({
      where: { deletedAt: null, status: { in: ["NEW", "CONTACTED", "QUOTED"] } },
    }),
    prisma.invoice.count({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { balanceFils: true },
    }),
    prisma.invoice.count({ where: { deletedAt: null, status: "OVERDUE" } }),
    prisma.ticket.count({
      where: { deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS", "AWAITING_CLIENT"] } },
    }),
    prisma.timeEntry.count({ where: { reviewStatus: "PENDING" } }),
    prisma.staffDocument.count({
      where: {
        deletedAt: null,
        expiresAt: { gte: today, lte: in60Days },
        staff: { deletedAt: null, employmentStatus: { not: "TERMINATED" } },
      },
    }),
    // "Below reorder level" is a comparison between two columns, which Prisma
    // cannot express in a plain `where`, so this is raw SQL.
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT count(*)::bigint AS count
      FROM inventory_items
      WHERE "deletedAt" IS NULL AND "isActive" AND "currentQty" <= "reorderLevel"
    `,
    prisma.team.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, nameAr: true, colorHex: true, capacityMinutesPerDay: true },
      orderBy: { name: "asc" },
    }),
    prisma.job.groupBy({
      by: ["teamId"],
      where: {
        deletedAt: null,
        scheduledStart: { gte: today, lt: tomorrow },
        status: { in: activeJobStatuses },
      },
      _sum: { durationMinutes: true },
    }),
    prisma.job.findMany({
      where: {
        deletedAt: null,
        scheduledStart: { gte: today },
        status: { in: ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS"] },
      },
      orderBy: { scheduledStart: "asc" },
      take: 8,
      select: {
        id: true,
        scheduledStart: true,
        status: true,
        client: { select: { contactName: true, companyName: true } },
        serviceType: { select: { nameEn: true, nameAr: true } },
        property: { select: { zone: { select: { nameEn: true, nameAr: true } } } },
        team: { select: { name: true, nameAr: true } },
      },
    }),
  ]);

  const bookedByTeam = new Map<string | null, number>(
    todaysJobsForUtilisation.map((row) => [row.teamId, row._sum?.durationMinutes ?? 0]),
  );

  const utilisation: UtilisationRow[] = teams.map((team) => {
    const bookedMinutes = bookedByTeam.get(team.id) ?? 0;
    const capacityMinutes = team.capacityMinutesPerDay;
    return {
      teamId: team.id,
      name: team.name,
      nameAr: team.nameAr,
      colorHex: team.colorHex,
      bookedMinutes,
      capacityMinutes,
      percent: capacityMinutes > 0 ? Math.round((bookedMinutes / capacityMinutes) * 100) : 0,
    };
  });

  const upcomingJobs: UpcomingJob[] = upcoming.map((job) => ({
    id: job.id,
    scheduledStart: job.scheduledStart,
    status: job.status,
    clientName: job.client.companyName ?? job.client.contactName,
    serviceNameEn: job.serviceType.nameEn,
    serviceNameAr: job.serviceType.nameAr,
    zoneNameEn: job.property.zone?.nameEn ?? null,
    zoneNameAr: job.property.zone?.nameAr ?? null,
    teamName: job.team?.name ?? null,
    teamNameAr: job.team?.nameAr ?? null,
  }));

  return {
    today,
    jobsToday,
    activeClients,
    commercialClients,
    residentialClients: activeClients - commercialClients,
    openLeads,
    unpaidInvoices,
    outstandingFils: outstanding._sum.balanceFils ?? 0,
    overdueInvoices,
    openTickets,
    flaggedClockIns,
    expiringDocuments,
    lowStockItems: Number(lowStockItems[0]?.count ?? 0),
    utilisation,
    upcomingJobs,
  };
}
