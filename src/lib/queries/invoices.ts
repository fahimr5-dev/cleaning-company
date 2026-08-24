import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { agedReceivables, agingBucketOf } from "@/lib/billing";

/** Reads for the invoice list, its summary, and one invoice's page. */

export type InvoiceListRow = {
  id: string;
  invoiceNo: string;
  type: string;
  clientId: string;
  clientName: string;
  status: string;
  issueDate: string;
  dueDate: string;
  totalFils: number;
  amountPaidFils: number;
  balanceFils: number;
  daysOverdue: number;
  agingBucket: string;
  jobCount: number;
  hasPayLink: boolean;
};

export async function getInvoices(options: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, options.pageSize ?? 25));
  const search = options.search?.trim();
  const now = new Date();

  const where: Prisma.InvoiceWhereInput = {
    deletedAt: null,
    ...(options.status && options.status !== "ALL"
      ? options.status === "UNPAID"
        ? { status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } }
        : { status: options.status as never }
      : {}),
    ...(search
      ? {
          OR: [
            { invoiceNo: { contains: search, mode: "insensitive" } },
            { buyerName: { contains: search, mode: "insensitive" } },
            { client: { contactName: { contains: search, mode: "insensitive" } } },
            { client: { companyName: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, invoices, allOpen, summary] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ issueDate: "desc" }, { invoiceNo: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, invoiceNo: true, type: true, clientId: true, status: true,
        issueDate: true, dueDate: true, totalFils: true, amountPaidFils: true,
        balanceFils: true, buyerName: true, stripePaymentLinkUrl: true,
        client: { select: { contactName: true, companyName: true } },
        _count: { select: { jobs: true } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        balanceFils: { gt: 0 },
      },
      select: { balanceFils: true, dueDate: true },
    }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { not: "VOID" } },
      _sum: { totalFils: true, amountPaidFils: true },
      _count: true,
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    aged: agedReceivables(allOpen, now),
    summary: {
      invoiceCount: summary._count,
      invoicedFils: summary._sum?.totalFils ?? 0,
      collectedFils: summary._sum?.amountPaidFils ?? 0,
      outstandingFils: allOpen.reduce((t, i) => t + i.balanceFils, 0),
      overdueCount: allOpen.filter((i) => agingBucketOf(i.dueDate, now) !== "CURRENT").length,
    },
    rows: invoices.map((invoice): InvoiceListRow => {
      const bucket = agingBucketOf(invoice.dueDate, now);
      const daysOverdue =
        invoice.balanceFils > 0 && bucket !== "CURRENT"
          ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000)
          : 0;
      return {
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        type: invoice.type,
        clientId: invoice.clientId,
        clientName: invoice.buyerName ?? invoice.client.companyName ?? invoice.client.contactName,
        status: invoice.status,
        issueDate: invoice.issueDate.toISOString(),
        dueDate: invoice.dueDate.toISOString(),
        totalFils: invoice.totalFils,
        amountPaidFils: invoice.amountPaidFils,
        balanceFils: invoice.balanceFils,
        daysOverdue,
        agingBucket: bucket,
        jobCount: invoice._count.jobs,
        hasPayLink: Boolean(invoice.stripePaymentLinkUrl),
      };
    }),
  };
}

export async function getInvoiceDetail(id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      client: {
        select: {
          id: true, clientNo: true, contactName: true, companyName: true,
          email: true, phone: true, whatsappPhone: true, trn: true,
          creditBalanceFils: true, isBookingPaused: true,
        },
      },
      payments: {
        where: { deletedAt: null },
        orderBy: { receivedAt: "desc" },
      },
      creditNotes: {
        where: { deletedAt: null },
        orderBy: { issueDate: "desc" },
      },
      dunningEvents: { orderBy: { step: "asc" } },
      jobs: {
        select: {
          id: true, jobNo: true, scheduledStart: true, totalFils: true,
          serviceType: { select: { nameEn: true, nameAr: true } },
        },
        orderBy: { scheduledStart: "asc" },
      },
    },
  });
  return invoice;
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoiceDetail>>>;
