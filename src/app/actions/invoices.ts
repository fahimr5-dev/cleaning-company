"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { runMonthlyConsolidation } from "@/lib/invoicing";
import { runDunning } from "@/lib/dunning";
import { sendEmail, logWhatsAppLink, isEmailConfigured } from "@/lib/email";
import { whatsappLink, fillTemplate } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";

/**
 * The two billing jobs an owner starts by hand: the month-end run, and sending
 * an invoice to a client. Both are OWNER-only, in the app and in the database.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const monthlySchema = z.object({
  /** YYYY-MM. Empty means last month, which is what month-end billing means. */
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  locale: z.string().max(5).default("en"),
});

/**
 * Raises one invoice per monthly-billed client for every completed job in the
 * month. Running it a second time creates nothing, because a job that already
 * sits on an invoice is skipped.
 */
export async function runMonthlyBillingAction(
  raw: unknown,
): Promise<Result<{ created: number; clients: number; totalFils: number; invoiceNos: string[] }>> {
  const parsed = monthlySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That month was not valid." };
  const { month, locale } = parsed.data;

  await requireRole(locale, "OWNER");

  const now = new Date();
  const [year, monthIndex] = month
    ? [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1]
    : [now.getUTCFullYear(), now.getUTCMonth() - 1];

  const periodStart = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

  const result = await runMonthlyConsolidation({ periodStart, periodEnd });

  revalidatePath(`/${locale}/invoices`);
  return { ok: true, ...result };
}

const remindersSchema = z.object({ locale: z.string().max(5).default("en") });

/**
 * Sends every reminder that is due right now, instead of waiting for the
 * nightly cron. Nothing is sent twice — a reminder already sent stays sent.
 */
export async function sendRemindersNowAction(
  raw: unknown,
): Promise<Result<{ sent: number; skippedPaid: number; failed: number; clientsPaused: number; problems: string[] }>> {
  const parsed = remindersSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { locale } = parsed.data;

  await requireRole(locale, "OWNER");

  const result = await runDunning();

  revalidatePath(`/${locale}/invoices`);
  return {
    ok: true,
    sent: result.sent,
    skippedPaid: result.skippedPaid,
    failed: result.failed,
    clientsPaused: result.clientsPaused,
    problems: result.problems,
  };
}

const sendSchema = z.object({
  invoiceId: z.string().uuid(),
  locale: z.string().max(5).default("en"),
});

/**
 * Emails the invoice to the client and records that it was sent.
 *
 * The WhatsApp link comes back with it, because in the UAE that is usually the
 * message the client actually reads.
 */
export async function sendInvoiceAction(
  raw: unknown,
): Promise<Result<{ emailed: boolean; whatsappUrl: string | null; problem: string | null }>> {
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { invoiceId, locale } = parsed.data;

  await requireRole(locale, "OWNER");

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: {
      client: {
        select: {
          id: true, clientNo: true, contactName: true, companyName: true,
          email: true, phone: true, whatsappPhone: true, locale: true,
        },
      },
    },
  });
  if (!invoice) return { ok: false, error: "That invoice no longer exists." };
  if (invoice.status === "VOID") {
    return { ok: false, error: "A voided invoice should not be sent." };
  }

  const client = invoice.client;
  const clientLocale = client.locale === "AR" ? "ar" : "en";
  const template = await prisma.messageTemplate.findUnique({
    where: { code: "INVOICE_ISSUED" },
  });

  const pdfUrl = `${env.appUrl}/api/invoice/${invoice.id}/pdf`;
  const values = {
    name: client.companyName ?? client.contactName,
    invoiceNo: invoice.invoiceNo,
    total: formatMoney(invoice.totalFils, clientLocale),
    balance: formatMoney(invoice.balanceFils, clientLocale),
    dueDate: invoice.dueDate.toLocaleDateString(clientLocale === "ar" ? "ar-AE" : "en-AE"),
    payLink: invoice.stripePaymentLinkUrl ?? `${env.appUrl}/${clientLocale}/portal`,
    pdfLink: pdfUrl,
  };

  const subject = fillTemplate(
    (clientLocale === "ar" ? template?.subjectAr : template?.subjectEn) ??
      "Invoice {{invoiceNo}}",
    values,
  );
  const body = fillTemplate(
    (clientLocale === "ar" ? template?.bodyAr : template?.bodyEn) ??
      "Hi {{name}}, here is invoice {{invoiceNo}} for {{total}}, due {{dueDate}}.",
    values,
  );

  let emailed = false;
  let problem: string | null = null;

  if (!client.email) {
    problem = "This client has no email address on file.";
  } else if (!isEmailConfigured()) {
    problem = "Email is not set up yet — add RESEND_API_KEY and RESEND_FROM_EMAIL to .env. Use the WhatsApp link in the meantime.";
  } else {
    const sent = await sendEmail({
      to: client.email,
      subject,
      text: `${body}\n\n${pdfUrl}`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6"${clientLocale === "ar" ? ' dir="rtl"' : ""}>
  <p>${body.replace(/\n/g, "<br>")}</p>
  <p><a href="${pdfUrl}">${clientLocale === "ar" ? "تحميل الفاتورة (PDF)" : "Download the invoice (PDF)"}</a></p>
  ${invoice.stripePaymentLinkUrl
    ? `<p><a href="${invoice.stripePaymentLinkUrl}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${clientLocale === "ar" ? "ادفع الآن" : "Pay now"}</a></p>`
    : ""}
</div>`,
      relatedEntity: "Invoice",
      relatedId: invoice.id,
      clientId: client.id,
      templateCode: "INVOICE_ISSUED",
    });
    emailed = sent.ok;
    if (!sent.ok) problem = sent.reason;
  }

  const phone = client.whatsappPhone ?? client.phone;
  const whatsappUrl = phone ? whatsappLink(phone, `${body}\n\n${pdfUrl}`) : null;
  if (phone) {
    await logWhatsAppLink({
      toPhone: phone,
      body: `${body}\n\n${pdfUrl}`,
      relatedEntity: "Invoice",
      relatedId: invoice.id,
      clientId: client.id,
      templateCode: "INVOICE_ISSUED",
    });
  }

  if (emailed) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { sentAt: new Date() },
    });
    await recordAudit({
      action: "SEND",
      entity: "Invoice",
      entityId: invoice.id,
      summary: `${invoice.invoiceNo} emailed to ${client.email}`,
    });
  }

  revalidatePath(`/${locale}/invoices/${invoice.id}`);
  return { ok: true, emailed, whatsappUrl, problem };
}
