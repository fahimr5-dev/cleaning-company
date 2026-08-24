import { prisma } from "@/lib/prisma";
import { LEAD_STATUSES, type BoardLead, type LeadBoard, type LeadStatus } from "@/lib/leads-shared";

export type { BoardLead, LeadBoard, LeadStatus };
export { LEAD_STATUSES };

/**
 * Everything the leads board needs, in one query per column.
 *
 * PLAIN ENGLISH: this reads the enquiries that have not yet become customers
 * and groups them into the five columns of your pipeline board.
 */

export async function getLeadBoard(): Promise<LeadBoard> {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null },
    orderBy: [{ boardPosition: "asc" }, { createdAt: "desc" }],
    select: {
      id: true, referenceNo: true, fullName: true, phone: true, email: true,
      status: true, source: true, lostReason: true, boardPosition: true,
      estimateFils: true, propertyType: true, bedrooms: true, sqm: true,
      frequency: true, preferredDate: true, createdAt: true,
      zone: { select: { nameEn: true, nameAr: true } },
      serviceType: { select: { nameEn: true, nameAr: true } },
      quotes: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, quoteNo: true },
      },
    },
  });

  const now = Date.now();
  const columns = Object.fromEntries(LEAD_STATUSES.map((s) => [s, [] as BoardLead[]])) as Record<
    LeadStatus,
    BoardLead[]
  >;

  for (const lead of leads) {
    const status = lead.status as LeadStatus;
    if (!columns[status]) continue;
    columns[status].push({
      id: lead.id,
      referenceNo: lead.referenceNo,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      status,
      source: lead.source,
      lostReason: lead.lostReason,
      boardPosition: lead.boardPosition,
      estimateFils: lead.estimateFils,
      propertyType: lead.propertyType,
      bedrooms: lead.bedrooms,
      sqm: lead.sqm,
      zoneNameEn: lead.zone?.nameEn ?? null,
      zoneNameAr: lead.zone?.nameAr ?? null,
      serviceNameEn: lead.serviceType?.nameEn ?? null,
      serviceNameAr: lead.serviceType?.nameAr ?? null,
      frequency: lead.frequency,
      preferredDate: lead.preferredDate?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
      ageDays: Math.floor((now - lead.createdAt.getTime()) / 86_400_000),
      quoteId: lead.quotes[0]?.id ?? null,
      quoteNo: lead.quotes[0]?.quoteNo ?? null,
    });
  }

  const counts = Object.fromEntries(
    LEAD_STATUSES.map((s) => [s, columns[s].length]),
  ) as Record<LeadStatus, number>;

  const sum = (rows: BoardLead[]) => rows.reduce((t, l) => t + (l.estimateFils ?? 0), 0);
  const decided = counts.WON + counts.LOST;

  return {
    columns,
    counts,
    openValueFils: sum(columns.NEW) + sum(columns.CONTACTED) + sum(columns.QUOTED),
    wonValueFils: sum(columns.WON),
    conversionRate: decided > 0 ? Math.round((counts.WON / decided) * 100) : 0,
  };
}

/** The notes and calls on one lead, newest first. */
export async function getLeadActivities(leadId: string) {
  return prisma.leadActivity.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
