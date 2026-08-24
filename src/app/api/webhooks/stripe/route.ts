import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { verifyWebhook } from "@/lib/stripe";
import { refreshInvoiceState } from "@/lib/invoicing";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-number";
import { formatMoney } from "@/lib/money";

/**
 * Where Stripe tells us an invoice has been paid.
 *
 * PLAIN ENGLISH: without this, a client could pay by card and the invoice would
 * still say unpaid. Stripe signs every message it sends; we check that
 * signature and refuse anything that does not carry it — otherwise anyone on
 * the internet could mark your invoices paid for free.
 */

// The signature is computed over the exact bytes Stripe sent, so the body must
// not be parsed or re-encoded before checking it.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const verified = verifyWebhook(rawBody, signature);
  if (!verified.ok) {
    // 400, not 500: Stripe should not keep retrying something we will never
    // accept, and a forged request deserves a flat refusal.
    return NextResponse.json({ error: verified.error }, { status: 400 });
  }

  const event = verified.event;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await markPaid({
          invoiceId: session.metadata?.invoiceId,
          amountFils: session.amount_total ?? 0,
          paymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
          eventId: event.id,
        });
        break;
      }
      case "payment_intent.succeeded": {
        const intent = event.data.object as Stripe.PaymentIntent;
        await markPaid({
          invoiceId: intent.metadata?.invoiceId,
          amountFils: intent.amount_received || intent.amount,
          paymentIntentId: intent.id,
          eventId: event.id,
        });
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
        if (intentId) await markRefunded(intentId, charge.amount_refunded);
        break;
      }
      default:
        // Everything else is fine but of no interest to us.
        break;
    }
  } catch (error) {
    console.error("[stripe-webhook] Failed to handle", event.type, error);
    // 500 asks Stripe to try again, which is right for a transient failure.
    return NextResponse.json({ error: "Could not process that event." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Records a card payment against an invoice.
 *
 * Stripe can and does deliver the same event twice, so this is written to be
 * safe to run repeatedly: a payment already recorded for this payment intent is
 * left exactly as it is.
 */
async function markPaid(input: {
  invoiceId?: string;
  amountFils: number;
  paymentIntentId: string | null;
  eventId: string;
}) {
  if (!input.invoiceId || input.amountFils <= 0) return;

  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, deletedAt: null },
    select: { id: true, invoiceNo: true, clientId: true },
  });
  if (!invoice) {
    console.warn(`[stripe-webhook] No invoice ${input.invoiceId} for event ${input.eventId}`);
    return;
  }

  if (input.paymentIntentId) {
    const existing = await prisma.payment.findFirst({
      where: { stripePaymentIntentId: input.paymentIntentId },
      select: { id: true },
    });
    if (existing) return; // already recorded — Stripe simply told us twice
  }

  await prisma.$transaction(async (tx) => {
    const paymentNo = await nextDocumentNumber(tx, "PAY");
    await tx.payment.create({
      data: {
        paymentNo,
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        method: "CARD_STRIPE",
        status: "SUCCEEDED",
        amountFils: input.amountFils,
        receivedAt: new Date(),
        stripePaymentIntentId: input.paymentIntentId,
        // A card payment reconciles itself: Stripe is the statement.
        reconciledAt: new Date(),
        notes: "Paid by card",
      },
    });
    await refreshInvoiceState(invoice.id, tx);
  });

  await recordAudit({
    action: "PAYMENT_RECORDED",
    entity: "Invoice",
    entityId: invoice.id,
    summary: `${formatMoney(input.amountFils, "en")} paid by card against ${invoice.invoiceNo}`,
    after: { source: "stripe", paymentIntentId: input.paymentIntentId },
  });
}

async function markRefunded(paymentIntentId: string, amountRefundedFils: number) {
  const payment = await prisma.payment.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, paymentNo: true, invoiceId: true, amountFils: true, status: true },
  });
  if (!payment || payment.status === "REFUNDED") return;

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: amountRefundedFils >= payment.amountFils ? "REFUNDED" : "SUCCEEDED" },
  });
  if (payment.invoiceId) await refreshInvoiceState(payment.invoiceId);

  await recordAudit({
    action: "REFUND",
    entity: "Payment",
    entityId: payment.id,
    summary: `${payment.paymentNo} refunded ${formatMoney(amountRefundedFils, "en")} via Stripe`,
  });
}
