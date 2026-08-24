import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Reads for the client list and the client detail screen.
 *
 * PLAIN ENGLISH: "lifetime value" here means money actually invoiced to a
 * client, not money we hope to invoice. Nothing is estimated.
 */

export type ClientListRow = {
  id: string;
  clientNo: string;
  displayName: string;
  type: string;
  status: string;
  phone: string;
  email: string | null;
  zoneNameEn: string | null;
  zoneNameAr: string | null;
  billingMode: string;
  referralCode: string;
  isBookingPaused: boolean;
  propertyCount: number;
  jobCount: number;
  lifetimeValueFils: number;
  outstandingFils: number;
  lastJobAt: string | null;
  createdAt: string;
};

export type ClientListResult = {
  rows: ClientListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getClients(options: {
  search?: string;
  type?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<ClientListResult> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25));
  const search = options.search?.trim();

  const where: Prisma.ClientWhereInput = {
    deletedAt: null,
    ...(options.type && options.type !== "ALL" ? { type: options.type as never } : {}),
    ...(options.status && options.status !== "ALL" ? { status: options.status as never } : {}),
    ...(search
      ? {
          OR: [
            { contactName: { contains: search, mode: "insensitive" } },
            { companyName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
            { clientNo: { contains: search, mode: "insensitive" } },
            { referralCode: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, clients] = await Promise.all([
    prisma.client.count({ where }),
    prisma.client.findMany({
      where,
      orderBy: [{ lastJobAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, clientNo: true, contactName: true, companyName: true, type: true,
        status: true, phone: true, email: true, billingMode: true, referralCode: true,
        isBookingPaused: true, lastJobAt: true, createdAt: true,
        properties: {
          where: { deletedAt: null },
          select: { id: true, isDefault: true, zone: { select: { nameEn: true, nameAr: true } } },
        },
        _count: { select: { jobs: true } },
      },
    }),
  ]);

  // Money per client, gathered in two grouped queries rather than one per row.
  const ids = clients.map((c) => c.id);
  const [invoiced, outstanding] = await Promise.all([
    ids.length
      ? prisma.invoice.groupBy({
          by: ["clientId"],
          where: { clientId: { in: ids }, deletedAt: null, status: { not: "VOID" } },
          _sum: { totalFils: true },
        })
      : [],
    ids.length
      ? prisma.invoice.groupBy({
          by: ["clientId"],
          where: {
            clientId: { in: ids },
            deletedAt: null,
            status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
          },
          _sum: { balanceFils: true },
        })
      : [],
  ]);

  const invoicedBy = new Map(invoiced.map((r) => [r.clientId, r._sum?.totalFils ?? 0]));
  const outstandingBy = new Map(outstanding.map((r) => [r.clientId, r._sum?.balanceFils ?? 0]));

  return {
    total,
    page,
    pageSize,
    rows: clients.map((c) => {
      const home = c.properties.find((p) => p.isDefault) ?? c.properties[0];
      return {
        id: c.id,
        clientNo: c.clientNo,
        displayName: c.companyName ?? c.contactName,
        type: c.type,
        status: c.status,
        phone: c.phone,
        email: c.email,
        zoneNameEn: home?.zone?.nameEn ?? null,
        zoneNameAr: home?.zone?.nameAr ?? null,
        billingMode: c.billingMode,
        referralCode: c.referralCode,
        isBookingPaused: c.isBookingPaused,
        propertyCount: c.properties.length,
        jobCount: c._count.jobs,
        lifetimeValueFils: invoicedBy.get(c.id) ?? 0,
        outstandingFils: outstandingBy.get(c.id) ?? 0,
        lastJobAt: c.lastJobAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
      };
    }),
  };
}

/** Everything on one client's page, including their referral performance. */
export async function getClientDetail(id: string) {
  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      properties: {
        where: { deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: { zone: true },
      },
      referredBy: { select: { id: true, contactName: true, companyName: true, referralCode: true } },
      referralsMade: {
        include: {
          refereeClient: { select: { id: true, contactName: true, companyName: true } },
          refereeLead: { select: { fullName: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      jobs: {
        where: { deletedAt: null },
        orderBy: { scheduledStart: "desc" },
        take: 10,
        select: {
          id: true, jobNo: true, status: true, scheduledStart: true, totalFils: true,
          serviceType: { select: { nameEn: true, nameAr: true } },
        },
      },
    },
  });
  if (!client) return null;

  const [invoiceTotals, outstandingTotals, ratingStats, jobCount] = await Promise.all([
    prisma.invoice.aggregate({
      where: { clientId: id, deletedAt: null, status: { not: "VOID" } },
      _sum: { totalFils: true },
      _count: true,
    }),
    prisma.invoice.aggregate({
      where: { clientId: id, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { balanceFils: true },
      _count: true,
    }),
    prisma.rating.aggregate({
      where: { clientId: id, submittedAt: { not: null } },
      _avg: { stars: true },
      _count: true,
    }),
    prisma.job.count({ where: { clientId: id, deletedAt: null, status: "COMPLETED" } }),
  ]);

  const referralRevenueFils = client.referralsMade.reduce(
    (sum, r) => sum + r.attributedRevenueFils,
    0,
  );

  return {
    client,
    stats: {
      lifetimeValueFils: invoiceTotals._sum?.totalFils ?? 0,
      invoiceCount: invoiceTotals._count,
      outstandingFils: outstandingTotals._sum?.balanceFils ?? 0,
      unpaidCount: outstandingTotals._count,
      averageRating: ratingStats._avg?.stars ?? null,
      ratingCount: ratingStats._count,
      completedJobs: jobCount,
      referralCount: client.referralsMade.length,
      referralRevenueFils,
    },
  };
}
