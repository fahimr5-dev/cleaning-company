"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-number";
import { refreshInvoiceState } from "@/lib/invoicing";
import { checkCreditNote, invoiceTotals, allocatePayment } from "@/lib/billing";
import { createInvoicePaymentLink, refundStripePayment, isStripeConfigured } from "@/lib/stripe";
import { formatMoney } from "@/lib/money";

/**
 * Money in and money back.
 *
 * Everything here is OWNER-only, in the app and independently in the database —
 * an operations manager can read invoices but never change what has been paid.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const PAYMENT_METHODS = ["CARD_STRIPE", "CASH", "BANK_TRANSFER", "CHEQUE", "CREDIT_NOTE"] as const;

const recordSchema = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(PAYMENT_METHODS),
  amountFils: z.coerce.number().int().min(1, "Enter an amount.").max(100_000_000),
  receivedAt: z.string().datetime().optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/**
 * Records a payment that arrived outside Stripe — cash on the doorstep, a bank
 * transfer, a cheque. This is how most UAE cleaning invoices are actually paid.
 */
export async function recordPaymentAction(
  raw: unknown,
): Promise<Result<{ paymentNo: string; balanceFils: number }>> {
  const parsed = recordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That payment was not valid." };
  }
  const { invoiceId, method, amountFils, receivedAt, reference, notes, locale } = parsed.data;

  const user = await requireRole(locale, "OWNER");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: { id: true, invoiceNo: true, clientId: true, status: true, balanceFils: true },
  });
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (invoice.status === "VOID") {
    return { ok: false, error: "A voided invoice cannot take a payment." };
  }

  // Overpaying is allowed — it happens — but it must be deliberate, so we say
  // so rather than quietly swallowing the extra.
  const overpayment = Math.max(0, amountFils - invoice.balanceFils);

  const payment = await prisma.$transaction(async (tx) => {
    const paymentNo = await nextDocumentNumber(tx, "PAY");
    const created = await tx.payment.create({
      data: {
        paymentNo,
        invoiceId,
        clientId: invoice.clientId,
        method,
        status: "SUCCEEDED",
        amountFils,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
        reference: reference || null,
        notes: notes || null,
        recordedById: user.id,
      },
    });

    // Anything paid beyond the invoice becomes credit on the client's account
    // rather than vanishing.
    if (overpayment > 0) {
      await tx.client.update({
        where: { id: invoice.clientId },
        data: { creditBalanceFils: { increment: overpayment } },
      });
    }

    await refreshInvoiceState(invoiceId, tx);
    return created;
  });

  await recordAudit({
    action: "PAYMENT_RECORDED",
    entity: "Invoice",
    entityId: invoiceId,
    summary:
      `${payment.paymentNo}: ${formatMoney(amountFils, "en")} received by ` +
      `${method.replace(/_/g, " ").toLowerCase()} against ${invoice.invoiceNo}` +
      (overpayment > 0 ? ` (${formatMoney(overpayment, "en")} held as credit)` : ""),
    after: { paymentNo: payment.paymentNo, method, amountFils, reference: reference ?? null },
  });

  const after = await prisma.invoice.findFirst({
    where: { id: invoiceId },
    select: { balanceFils: true },
  });

  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/invoices/${invoiceId}`);
  return { ok: true, paymentNo: payment.paymentNo, balanceFils: after?.balanceFils ?? 0 };
}

const reconcileSchema = z.object({
  paymentId: z.string().uuid(),
  locale: z.string().max(5).default("en"),
});

/** Marks a payment as matched against the bank statement. */
export async function reconcilePaymentAction(raw: unknown): Promise<Result> {
  const parsed = reconcileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { paymentId, locale } = parsed.data;

  const user = await requireRole(locale, "OWNER");

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, deletedAt: null },
    select: { id: true, paymentNo: true, invoiceId: true, reconciledAt: true },
  });
  if (!payment) return { ok: false, error: "That payment no longer exists." };
  if (payment.reconciledAt) return { ok: false, error: "That payment is already reconciled." };

  await prisma.payment.update({
    where: { id: paymentId },
    data: { reconciledAt: new Date(), reconciledById: user.id },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Payment",
    entityId: paymentId,
    summary: `${payment.paymentNo} reconciled against the bank statement`,
  });

  revalidatePath(`/${locale}/invoices`);
  if (payment.invoiceId) revalidatePath(`/${locale}/invoices/${payment.invoiceId}`);
  return { ok: true };
}

const payLinkSchema = z.object({
  invoiceId: z.string().uuid(),
  locale: z.string().max(5).default("en"),
});

/** Creates (or reuses) the card payment page for an invoice. */
export async function createPaymentLinkAction(
  raw: unknown,
): Promise<Result<{ url: string }>> {
  const parsed = payLinkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { invoiceId, locale } = parsed.data;

  await requireRole(locale, "OWNER");

  if (!isStripeConfigured()) {
    return {
      ok: false,
      error: "Card payments are not set up yet. Add STRIPE_SECRET_KEY to .env, or record a cash or bank transfer instead.",
    };
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: {
      id: true, invoiceNo: true, balanceFils: true, currency: true,
      stripePaymentLinkUrl: true, buyerName: true, status: true,
    },
  });
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (invoice.balanceFils <= 0) return { ok: false, error: "That invoice is already settled." };
  if (invoice.stripePaymentLinkUrl) return { ok: true, url: invoice.stripePaymentLinkUrl };

  const link = await createInvoicePaymentLink({
    invoiceId: invoice.id,
    invoiceNo: invoice.invoiceNo,
    amountFils: invoice.balanceFils,
    currency: invoice.currency,
    clientName: invoice.buyerName ?? "",
  });
  if (!link.ok) return { ok: false, error: link.error };

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { stripePaymentLinkUrl: link.url },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Invoice",
    entityId: invoiceId,
    summary: `Card payment link created for ${invoice.invoiceNo}`,
  });

  revalidatePath(`/${locale}/invoices/${invoiceId}`);
  return { ok: true, url: link.url };
}

const creditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  amountFils: z.coerce.number().int().min(1).max(100_000_000),
  reason: z.string().trim().min(3, "Give a reason.").max(500),
  /** Also send the money back to the card it came from. */
  refundToCard: z.boolean().default(false),
  locale: z.string().max(5).default("en"),
});

/**
 * Raises a credit note — the only correct way to reduce or cancel an invoice
 * that has already been issued. You never delete a tax invoice.
 */
export async function createCreditNoteAction(
  raw: unknown,
): Promise<Result<{ creditNoteNo: string; refunded: boolean; refundProblem?: string }>> {
  const parsed = creditNoteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That request was not valid." };
  }
  const { invoiceId, amountFils, reason, refundToCard, locale } = parsed.data;

  const user = await requireRole(locale, "OWNER");

  const [invoice, org] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: invoiceId, deletedAt: null },
      select: {
        id: true, invoiceNo: true, clientId: true, totalFils: true, status: true,
        vatRateBps: true,
        creditNotes: {
          where: { deletedAt: null, status: { in: ["ISSUED", "APPLIED"] } },
          select: { totalFils: true },
        },
        payments: {
          where: { deletedAt: null, status: "SUCCEEDED", method: "CARD_STRIPE" },
          select: { id: true, stripePaymentIntentId: true, amountFils: true },
        },
      },
    }),
    prisma.organization.findFirst(),
  ]);
  if (!invoice || !org) return { ok: false, error: "That invoice no longer exists." };

  const alreadyCreditedFils = invoice.creditNotes.reduce((t, c) => t + c.totalFils, 0);
  const check = checkCreditNote({
    invoiceTotalFils: invoice.totalFils,
    alreadyCreditedFils,
    requestedFils: amountFils,
    isVoid: invoice.status === "VOID",
  });

  if (!check.allowed) {
    const messages: Record<string, string> = {
      EXCEEDS_INVOICE: `You can credit at most ${formatMoney(check.maxCreditableFils, "en")} against this invoice.`,
      INVOICE_VOID: "A voided invoice cannot be credited.",
      NOTHING_TO_CREDIT: "This invoice has already been credited in full.",
    };
    return { ok: false, error: messages[check.reason ?? ""] ?? "That credit note is not allowed." };
  }

  // The credit note carries VAT at the same rate as the invoice, so the tax
  // reclaimed matches the tax originally charged.
  const netFils = Math.round((amountFils * 10000) / (10000 + invoice.vatRateBps));
  const totals = invoiceTotals([
    { quantity: 1, unitPriceFils: netFils, vatRateBps: invoice.vatRateBps },
  ]);

  const creditNote = await prisma.$transaction(async (tx) => {
    const creditNoteNo = await nextDocumentNumber(tx, "CN");
    const created = await tx.creditNote.create({
      data: {
        creditNoteNo,
        invoiceId,
        clientId: invoice.clientId,
        status: "ISSUED",
        reason,
        issueDate: new Date(),
        subtotalFils: totals.netFils,
        vatRateBps: invoice.vatRateBps,
        vatFils: totals.vatFils,
        totalFils: totals.totalFils,
        approvedById: user.id,
        approvedAt: new Date(),
        createdById: user.id,
        lines: {
          create: {
            descriptionEn: reason,
            quantity: 1,
            unitPriceFils: totals.netFils,
            vatRateBps: invoice.vatRateBps,
            vatFils: totals.vatFils,
            lineTotalFils: totals.netFils,
          },
        },
      },
    });
    await refreshInvoiceState(invoiceId, tx);
    return created;
  });

  // Optionally send the money back to the card it came from.
  let refunded = false;
  let refundProblem: string | undefined;

  if (refundToCard) {
    const cardPayment = invoice.payments.find((p) => p.stripePaymentIntentId);
    if (!cardPayment?.stripePaymentIntentId) {
      refundProblem = "No card payment was found on this invoice, so nothing could be refunded to a card.";
    } else {
      const refund = await refundStripePayment({
        paymentIntentId: cardPayment.stripePaymentIntentId,
        amountFils: Math.min(creditNote.totalFils, cardPayment.amountFils),
        reason,
      });
      if (refund.ok) {
        refunded = true;
        await prisma.creditNote.update({
          where: { id: creditNote.id },
          data: {
            refundedAmountFils: refund.amountFils,
            refundMethod: "CARD_STRIPE",
            refundedAt: new Date(),
            status: "APPLIED",
          },
        });
        await prisma.payment.update({
          where: { id: cardPayment.id },
          data: { status: "REFUNDED" },
        });
        await refreshInvoiceState(invoiceId);
      } else {
        refundProblem = refund.error;
      }
    }
  }

  await recordAudit({
    action: refunded ? "REFUND" : "CREATE",
    entity: "CreditNote",
    entityId: creditNote.id,
    summary:
      `${creditNote.creditNoteNo} for ${formatMoney(creditNote.totalFils, "en")} against ` +
      `${invoice.invoiceNo}: ${reason}` + (refunded ? " (refunded to card)" : ""),
    after: {
      creditNoteNo: creditNote.creditNoteNo,
      totalFils: creditNote.totalFils,
      refunded,
    },
  });

  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/invoices/${invoiceId}`);
  return { ok: true, creditNoteNo: creditNote.creditNoteNo, refunded, refundProblem };
}

const applyCreditSchema = z.object({
  clientId: z.string().uuid(),
  locale: z.string().max(5).default("en"),
});

/**
 * Spends a client's account credit against whatever they currently owe,
 * oldest invoice first.
 */
export async function applyClientCreditAction(
  raw: unknown,
): Promise<Result<{ appliedFils: number; invoiceCount: number }>> {
  const parsed = applyCreditSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { clientId, locale } = parsed.data;

  const user = await requireRole(locale, "OWNER");

  const client = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, clientNo: true, creditBalanceFils: true },
  });
  if (!client) return { ok: false, error: "That client no longer exists." };
  if (client.creditBalanceFils <= 0) {
    return { ok: false, error: "This client has no credit to apply." };
  }

  const open = await prisma.invoice.findMany({
    where: {
      clientId, deletedAt: null,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      balanceFils: { gt: 0 },
    },
    select: { id: true, invoiceNo: true, balanceFils: true, dueDate: true },
  });
  if (open.length === 0) return { ok: false, error: "This client has nothing outstanding." };

  const { allocations } = allocatePayment(client.creditBalanceFils, open);
  const appliedFils = allocations.reduce((t, a) => t + a.amountFils, 0);

  await prisma.$transaction(async (tx) => {
    for (const allocation of allocations) {
      const paymentNo = await nextDocumentNumber(tx, "PAY");
      await tx.payment.create({
        data: {
          paymentNo,
          invoiceId: allocation.invoiceId,
          clientId,
          method: "CREDIT_NOTE",
          status: "SUCCEEDED",
          amountFils: allocation.amountFils,
          receivedAt: new Date(),
          notes: "Applied from account credit",
          recordedById: user.id,
          reconciledAt: new Date(),
          reconciledById: user.id,
        },
      });
      await refreshInvoiceState(allocation.invoiceId, tx);
    }
    await tx.client.update({
      where: { id: clientId },
      data: { creditBalanceFils: { decrement: appliedFils } },
    });
  });

  await recordAudit({
    action: "PAYMENT_RECORDED",
    entity: "Client",
    entityId: clientId,
    summary:
      `Applied ${formatMoney(appliedFils, "en")} of account credit for ${client.clientNo} ` +
      `across ${allocations.length} invoice(s)`,
  });

  revalidatePath(`/${locale}/invoices`);
  revalidatePath(`/${locale}/clients/${clientId}`);
  return { ok: true, appliedFils, invoiceCount: allocations.length };
}
