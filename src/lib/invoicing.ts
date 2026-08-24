import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextDocumentNumber } from "@/lib/document-number";
import { recordAudit } from "@/lib/audit";
import {
  invoiceTotals, settleInvoice, checkPackageUse, dunningSchedule,
  type InvoiceLineInput,
} from "@/lib/billing";

/**
 * Turning finished work into money owed.
 *
 * PLAIN ENGLISH: when a job is finished one of three things happens.
 *   1. The client has a prepaid package  -> a session is used up, no invoice.
 *   2. The client is billed per job      -> an invoice is raised now.
 *   3. The client is billed monthly      -> nothing yet; it goes on the
 *                                            month-end invoice with the rest.
 */

export type InvoiceOutcome =
  | { kind: "PACKAGE_USED"; clientPackageId: string; sessionsRemaining: number }
  | { kind: "INVOICED"; invoiceId: string; invoiceNo: string; totalFils: number }
  | { kind: "DEFERRED_TO_MONTHLY" }
  | { kind: "ALREADY_INVOICED"; invoiceId: string }
  | { kind: "SKIPPED"; reason: string };

/**
 * Decides what to do about one finished job, and does it.
 *
 * Safe to call twice: a job that already has an invoice or a used session is
 * left alone rather than billed again.
 */
export async function billCompletedJob(jobId: string): Promise<InvoiceOutcome> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, deletedAt: null },
    select: {
      id: true, jobNo: true, status: true, invoiceId: true, clientId: true,
      scheduledStart: true, actualEnd: true,
      subtotalFils: true, discountFils: true, vatRateBps: true, totalFils: true,
      serviceTypeId: true,
      serviceType: { select: { nameEn: true, nameAr: true } },
      client: {
        select: {
          id: true, clientNo: true, billingMode: true, paymentTermsDays: true,
          contactName: true, companyName: true, trn: true,
        },
      },
      packageUsage: { select: { id: true } },
    },
  });

  if (!job) return { kind: "SKIPPED", reason: "That job no longer exists." };
  if (job.status !== "COMPLETED") {
    return { kind: "SKIPPED", reason: "Only a completed job is billed." };
  }
  if (job.invoiceId) return { kind: "ALREADY_INVOICED", invoiceId: job.invoiceId };
  if (job.packageUsage) {
    return { kind: "SKIPPED", reason: "A prepaid session was already used for this job." };
  }

  // 1. A prepaid package always comes first — the client has already paid.
  const usable = await findUsablePackage(job.clientId, job.serviceTypeId);
  if (usable) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.packageUsage.create({
        data: { clientPackageId: usable.id, jobId: job.id, sessionsUsed: 1 },
      });
      const pkg = await tx.clientPackage.update({
        where: { id: usable.id },
        data: { sessionsUsed: { increment: 1 } },
        select: { id: true, sessionsTotal: true, sessionsUsed: true },
      });
      // Mark it used up so it stops being offered.
      if (pkg.sessionsUsed >= pkg.sessionsTotal) {
        await tx.clientPackage.update({ where: { id: pkg.id }, data: { status: "USED_UP" } });
      }
      return pkg;
    });

    await recordAudit({
      action: "UPDATE",
      entity: "ClientPackage",
      entityId: usable.id,
      summary: `Job ${job.jobNo} paid with a prepaid session (${updated.sessionsUsed}/${updated.sessionsTotal} used)`,
    });

    return {
      kind: "PACKAGE_USED",
      clientPackageId: usable.id,
      sessionsRemaining: updated.sessionsTotal - updated.sessionsUsed,
    };
  }

  // 2. Monthly clients wait for the month-end run.
  if (job.client.billingMode === "MONTHLY_CONSOLIDATED") {
    return { kind: "DEFERRED_TO_MONTHLY" };
  }

  // 3. Everybody else gets an invoice now.
  const invoice = await createInvoiceForJobs({
    clientId: job.clientId,
    jobIds: [job.id],
    type: "STANDARD",
    supplyDate: job.actualEnd ?? job.scheduledStart,
  });

  return {
    kind: "INVOICED",
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    totalFils: invoice.totalFils,
  };
}

/** The package to spend on this job, if there is one. */
async function findUsablePackage(clientId: string, serviceTypeId: string) {
  const packages = await prisma.clientPackage.findMany({
    where: { clientId, status: "ACTIVE" },
    orderBy: { purchasedAt: "asc" }, // spend the oldest first, before it expires
    include: { package: { select: { serviceTypeId: true } } },
  });

  const now = new Date();
  for (const pkg of packages) {
    // A package tied to one service can only pay for that service.
    if (pkg.package.serviceTypeId && pkg.package.serviceTypeId !== serviceTypeId) continue;
    const check = checkPackageUse(
      {
        sessionsTotal: pkg.sessionsTotal,
        sessionsUsed: pkg.sessionsUsed,
        expiresAt: pkg.expiresAt,
        status: pkg.status,
      },
      now,
    );
    if (check.canUse) return pkg;
  }
  return null;
}

/**
 * Builds one invoice covering the given jobs.
 *
 * The buyer's name, address and TRN are copied ONTO the invoice, because a tax
 * document must never change afterwards if somebody edits the client record.
 */
export async function createInvoiceForJobs(input: {
  clientId: string;
  jobIds: string[];
  type: "STANDARD" | "CONSOLIDATED";
  supplyDate: Date;
  periodStart?: Date;
  periodEnd?: Date;
  issueDate?: Date;
}) {
  const [org, client, jobs] = await Promise.all([
    prisma.organization.findFirst(),
    prisma.client.findFirstOrThrow({
      where: { id: input.clientId },
      include: {
        properties: {
          where: { deletedAt: null, isDefault: true },
          take: 1,
          include: { zone: true },
        },
      },
    }),
    prisma.job.findMany({
      where: { id: { in: input.jobIds }, deletedAt: null },
      orderBy: { scheduledStart: "asc" },
      include: {
        serviceType: { select: { id: true, nameEn: true, nameAr: true } },
        lines: { orderBy: { sortOrder: "asc" } },
      },
    }),
  ]);

  if (!org) throw new Error("Company settings are missing. Run `npm run db:seed`.");
  if (jobs.length === 0) throw new Error("No jobs to invoice.");

  const issueDate = input.issueDate ?? new Date();
  const dueDate = new Date(issueDate);
  dueDate.setDate(dueDate.getDate() + client.paymentTermsDays);

  // Each job becomes one line, using the price agreed when it was booked.
  const lineInputs: (InvoiceLineInput & {
    jobId: string; serviceTypeId: string; descriptionEn: string; descriptionAr: string;
  })[] = jobs.map((job) => ({
    jobId: job.id,
    serviceTypeId: job.serviceType.id,
    descriptionEn: `${job.serviceType.nameEn} — ${job.scheduledStart.toISOString().slice(0, 10)}`,
    descriptionAr: `${job.serviceType.nameAr} — ${job.scheduledStart.toISOString().slice(0, 10)}`,
    quantity: 1,
    unitPriceFils: job.subtotalFils,
    discountFils: job.discountFils,
    vatRateBps: job.vatRateBps,
  }));

  const totals = invoiceTotals(lineInputs);

  const property = client.properties[0];
  const buyerAddress = [
    property?.buildingName, property?.unitNumber, property?.addressLine1,
    property?.zone?.nameEn, property?.emirate,
  ].filter(Boolean).join(", ");

  return prisma.$transaction(async (tx) => {
    const invoiceNo = await nextDocumentNumber(tx, "INV");

    const invoice = await tx.invoice.create({
      data: {
        invoiceNo,
        type: input.type,
        clientId: client.id,
        status: "ISSUED",
        issueDate,
        dueDate,
        periodStart: input.periodStart ?? null,
        periodEnd: input.periodEnd ?? null,
        currency: org.currency,
        vatRateBps: org.vatRateBps,
        subtotalFils: totals.subtotalFils,
        discountFils: totals.discountFils,
        vatFils: totals.vatFils,
        totalFils: totals.totalFils,
        amountPaidFils: 0,
        balanceFils: totals.totalFils,
        // Frozen at issue time — see the note above.
        supplierName: org.name,
        supplierTrn: org.trn,
        supplierAddress: [org.addressLine1, org.addressLine2, org.city, org.emirate]
          .filter(Boolean).join(", "),
        buyerName: client.companyName ?? client.contactName,
        buyerTrn: client.trn,
        buyerAddress: buyerAddress || null,
        sentAt: null,
        lines: {
          create: lineInputs.map((line, index) => {
            const t = invoiceTotals([line]);
            return {
              jobId: line.jobId,
              serviceTypeId: line.serviceTypeId,
              descriptionEn: line.descriptionEn,
              descriptionAr: line.descriptionAr,
              quantity: line.quantity,
              unitPriceFils: line.unitPriceFils,
              discountFils: line.discountFils ?? 0,
              vatRateBps: line.vatRateBps,
              vatFils: t.vatFils,
              lineTotalFils: t.netFils,
              sortOrder: index,
            };
          }),
        },
      },
    });

    await tx.job.updateMany({
      where: { id: { in: jobs.map((j) => j.id) } },
      data: { invoiceId: invoice.id },
    });

    // Queue the payment reminders now, so nothing depends on remembering later.
    for (const step of dunningSchedule(dueDate, org.dunningOffsetsDays)) {
      await tx.dunningEvent.create({
        data: {
          invoiceId: invoice.id,
          step: step.step,
          offsetDays: step.offsetDays,
          channel: "BOTH",
          scheduledFor: step.dueAt,
          status: "SCHEDULED",
        },
      });
    }

    return invoice;
  });
}

export type MonthlyRunResult = {
  created: number;
  clients: number;
  totalFils: number;
  invoiceNos: string[];
};

/**
 * The month-end run for clients billed monthly.
 *
 * Gathers every completed, not-yet-invoiced job in the period into one invoice
 * per client. Running it twice does nothing the second time.
 */
export async function runMonthlyConsolidation(input: {
  periodStart: Date;
  periodEnd: Date;
  issueDate?: Date;
}): Promise<MonthlyRunResult> {
  const jobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
      status: "COMPLETED",
      invoiceId: null,
      packageUsage: null,
      scheduledStart: { gte: input.periodStart, lte: input.periodEnd },
      client: { billingMode: "MONTHLY_CONSOLIDATED", deletedAt: null },
    },
    select: { id: true, clientId: true, scheduledStart: true },
    orderBy: { scheduledStart: "asc" },
  });

  const byClient = new Map<string, { ids: string[]; latest: Date }>();
  for (const job of jobs) {
    const entry = byClient.get(job.clientId) ?? { ids: [], latest: job.scheduledStart };
    entry.ids.push(job.id);
    if (job.scheduledStart > entry.latest) entry.latest = job.scheduledStart;
    byClient.set(job.clientId, entry);
  }

  const invoiceNos: string[] = [];
  let totalFils = 0;

  for (const [clientId, entry] of byClient) {
    const invoice = await createInvoiceForJobs({
      clientId,
      jobIds: entry.ids,
      type: "CONSOLIDATED",
      supplyDate: entry.latest,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      issueDate: input.issueDate,
    });
    invoiceNos.push(invoice.invoiceNo);
    totalFils += invoice.totalFils;

    await recordAudit({
      action: "CREATE",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `Monthly invoice ${invoice.invoiceNo} raised for ${entry.ids.length} jobs`,
    });
  }

  return { created: invoiceNos.length, clients: byClient.size, totalFils, invoiceNos };
}

/**
 * Recalculates one invoice's paid amount, balance and status from what is
 * actually recorded against it.
 *
 * Always derive these — never trust a running total that somebody might have
 * updated in one place and not another.
 */
export async function refreshInvoiceState(
  invoiceId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId },
    select: { id: true, totalFils: true, dueDate: true, status: true },
  });
  if (!invoice) return;

  const payments = await db.payment.aggregate({
    where: { invoiceId, deletedAt: null, status: "SUCCEEDED" },
    _sum: { amountFils: true },
  });
  const credits = await db.creditNote.aggregate({
    where: { invoiceId, deletedAt: null, status: { in: ["ISSUED", "APPLIED"] } },
    _sum: { totalFils: true },
  });

  const settlement = settleInvoice({
    totalFils: invoice.totalFils,
    paidFils: payments._sum?.amountFils ?? 0,
    creditedFils: credits._sum?.totalFils ?? 0,
    dueDate: invoice.dueDate,
    now: new Date(),
    isVoid: invoice.status === "VOID",
    isDraft: invoice.status === "DRAFT",
  });

  await db.invoice.update({
    where: { id: invoiceId },
    data: {
      amountPaidFils: payments._sum?.amountFils ?? 0,
      balanceFils: settlement.balanceFils,
      status: settlement.status,
      paidAt: settlement.status === "PAID" ? new Date() : null,
    },
  });
}
