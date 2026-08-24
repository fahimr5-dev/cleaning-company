import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

/**
 * Card payments.
 *
 * PLAIN ENGLISH: we never see or store a card number. We ask Stripe for a
 * payment page, put that link in the invoice email and the WhatsApp message,
 * and Stripe tells us when it has been paid.
 *
 * If Stripe is not configured this does NOT pretend to work — the caller gets a
 * readable failure and the server prints a loud TODO. Manual cash and bank
 * transfer recording keeps working regardless, which is how most UAE cleaning
 * invoices are settled anyway.
 */

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    "\n!! TODO — CARD PAYMENTS ARE OFF.\n" +
      "   STRIPE_SECRET_KEY is not set, so no card payment link can be created.\n" +
      "   Invoices, cash and bank-transfer recording all still work.\n" +
      "   See .env.example, Section 4.\n",
  );
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function client(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export type PaymentLinkResult =
  | { ok: true; url: string; paymentLinkId: string }
  | { ok: false; error: string };

/**
 * Creates a hosted payment page for one invoice.
 *
 * The amount is sent in fils, which is exactly how Stripe wants AED — its
 * "smallest currency unit". No conversion, no rounding, no chance of drift.
 */
export async function createInvoicePaymentLink(input: {
  invoiceNo: string;
  invoiceId: string;
  amountFils: number;
  currency: string;
  clientName: string;
  description?: string;
}): Promise<PaymentLinkResult> {
  const stripe = client();
  if (!stripe) {
    warnOnce();
    return {
      ok: false,
      error: "Card payments are not set up yet. Record a cash or bank transfer instead.",
    };
  }
  if (input.amountFils <= 0) {
    return { ok: false, error: "There is nothing left to pay on this invoice." };
  }

  try {
    const price = await stripe.prices.create({
      currency: input.currency.toLowerCase(),
      unit_amount: input.amountFils,
      product_data: { name: `Invoice ${input.invoiceNo}` },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      // Comes back to us on the webhook, so we know which invoice was paid.
      metadata: { invoiceId: input.invoiceId, invoiceNo: input.invoiceNo },
      payment_intent_data: {
        metadata: { invoiceId: input.invoiceId, invoiceNo: input.invoiceNo },
      },
      after_completion: {
        type: "redirect",
        redirect: { url: `${env.appUrl}/en/invoice-paid?ref=${encodeURIComponent(input.invoiceNo)}` },
      },
    });

    return { ok: true, url: link.url, paymentLinkId: link.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    console.error("[stripe] Could not create a payment link:", message);
    return { ok: false, error: `Stripe refused to create a payment link: ${message}` };
  }
}

export type RefundResult =
  | { ok: true; refundId: string; amountFils: number }
  | { ok: false; error: string };

/** Sends money back to a card. Only for payments actually taken by card. */
export async function refundStripePayment(input: {
  paymentIntentId: string;
  amountFils: number;
  reason?: string;
}): Promise<RefundResult> {
  const stripe = client();
  if (!stripe) {
    warnOnce();
    return { ok: false, error: "Card payments are not set up, so no card refund can be made." };
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: input.paymentIntentId,
      amount: input.amountFils,
      metadata: input.reason ? { reason: input.reason.slice(0, 400) } : undefined,
    });
    return { ok: true, refundId: refund.id, amountFils: refund.amount };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Stripe error";
    console.error("[stripe] Refund failed:", message);
    return { ok: false, error: `Stripe refused the refund: ${message}` };
  }
}

export type VerifiedEvent =
  | { ok: true; event: Stripe.Event }
  | { ok: false; error: string };

/**
 * Checks that a webhook really came from Stripe.
 *
 * Without this anybody could post "invoice paid" at our server and mark
 * invoices settled for free. The signature is what makes it trustworthy, so a
 * missing signing secret is treated as a failure, never waved through.
 */
export function verifyWebhook(rawBody: string, signature: string | null): VerifiedEvent {
  const stripe = client();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) return { ok: false, error: "Stripe is not configured on this server." };
  if (!secret) {
    console.error(
      "\n!! STRIPE_WEBHOOK_SECRET is not set. Webhooks are being REJECTED, which is\n" +
        "   correct — without it we cannot tell a real Stripe message from a forged\n" +
        "   one. See .env.example, Section 4.\n",
    );
    return { ok: false, error: "This server cannot verify Stripe webhooks yet." };
  }
  if (!signature) return { ok: false, error: "That request carried no Stripe signature." };

  try {
    return { ok: true, event: stripe.webhooks.constructEvent(rawBody, signature, secret) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    console.warn("[stripe] Rejected a webhook:", message);
    return { ok: false, error: message };
  }
}
