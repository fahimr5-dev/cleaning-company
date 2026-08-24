"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { priceQuote, quoteInputSchema, QuoteError, type QuoteResult } from "@/lib/quote";
import { nextDocumentNumber } from "@/lib/document-number";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import { sendEmail, logWhatsAppLink, isEmailConfigured } from "@/lib/email";
import { whatsappLink, fillTemplate } from "@/lib/whatsapp";
import { recordAudit } from "@/lib/audit";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";

/**
 * The two things the public website can ask the server to do:
 * price a job, and turn that price into a lead.
 *
 * Both are Server Actions, which means the rate card never leaves the server
 * and a visitor cannot tamper with prices by editing the page.
 */

export type CalculateResult =
  | { ok: true; quote: QuoteResult }
  | { ok: false; error: string };

export async function calculateQuoteAction(raw: unknown): Promise<CalculateResult> {
  const parsed = quoteInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Those details are not valid." };
  }

  try {
    return { ok: true, quote: await priceQuote(parsed.data) };
  } catch (error) {
    if (error instanceof QuoteError) return { ok: false, error: error.message };
    console.error("[quote] Unexpected pricing failure", error);
    return { ok: false, error: "We could not price that just now. Please call us instead." };
  }
}

const LEAD_SOURCES = [
  "GOOGLE", "INSTAGRAM", "FACEBOOK", "TIKTOK", "REFERRAL", "WALK_IN", "REPEAT", "PARTNER", "OTHER",
] as const;

const leadInputSchema = quoteInputSchema.extend({
  fullName: z.string().trim().min(2, "Please enter your name.").max(120),
  phone: z.string().trim().min(7, "Please enter a valid phone number.").max(24),
  email: z.string().trim().email("Please enter a valid email address.").max(160).optional().or(z.literal("")),
  zoneId: z.string().uuid().optional().or(z.literal("")),
  addressLine: z.string().trim().max(240).optional(),
  preferredDate: z.string().trim().max(30).optional(),
  notes: z.string().trim().max(2000).optional(),
  source: z.enum(LEAD_SOURCES).default("OTHER"),
  locale: z.enum(["en", "ar"]).default("en"),
  utmSource: z.string().trim().max(80).optional(),
  utmMedium: z.string().trim().max(80).optional(),
  utmCampaign: z.string().trim().max(80).optional(),
  /** Hidden field. Humans leave it empty; bots fill everything in. */
  website: z.string().max(0).optional(),
});

export type SubmitLeadResult =
  | {
      ok: true;
      quoteNo: string;
      referenceNo: string;
      totalFils: number;
      whatsappUrl: string | null;
      /** False when email is not configured — the screen says so out loud. */
      emailSent: boolean;
      emailProblem: string | null;
    }
  | { ok: false; error: string };

const FREQUENCY_LABELS: Record<string, { en: string; ar: string }> = {
  ONE_OFF: { en: "One-off", ar: "مرة واحدة" },
  WEEKLY: { en: "Weekly", ar: "أسبوعي" },
  BI_WEEKLY: { en: "Every two weeks", ar: "كل أسبوعين" },
  MONTHLY: { en: "Monthly", ar: "شهري" },
};

export async function submitLeadAction(raw: unknown): Promise<SubmitLeadResult> {
  const parsed = leadInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  }
  const input = parsed.data;

  // Spam trap. A real visitor never sees this field, so anything in it is a bot.
  // We accept the request and drop it, rather than telling the bot it failed.
  if (input.website) {
    console.warn("[lead] Honeypot triggered — request discarded, no lead created.");
    return {
      ok: true, quoteNo: "—", referenceNo: "—", totalFils: 0,
      whatsappUrl: null, emailSent: false, emailProblem: null,
    };
  }

  // Simple flood guard: the same phone number cannot raise more than three
  // enquiries in an hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.lead.count({
    where: { phone: input.phone, createdAt: { gte: oneHourAgo } },
  });
  if (recent >= 3) {
    return {
      ok: false,
      error: "We already have your enquiry and will be in touch shortly. Please call us if it is urgent.",
    };
  }

  let quote: QuoteResult;
  try {
    quote = await priceQuote(input);
  } catch (error) {
    if (error instanceof QuoteError) return { ok: false, error: error.message };
    console.error("[lead] Pricing failed", error);
    return { ok: false, error: "We could not price that just now. Please call us instead." };
  }

  const org = await prisma.organization.findFirst();
  if (!org) return { ok: false, error: "Company settings are missing. Run `npm run db:seed`." };

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + org.quoteValidityDays);

  const mainService = await prisma.serviceType.findUnique({ where: { code: input.serviceCode } });

  // Lead, quote and quote lines are written together: a quote with no lead, or
  // a lead with a half-written quote, would both be worse than nothing.
  const { lead, createdQuote } = await prisma.$transaction(async (tx) => {
    const referenceNo = await nextDocumentNumber(tx, "LD");
    const quoteNo = await nextDocumentNumber(tx, "QT");

    const lead = await tx.lead.create({
      data: {
        referenceNo,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || null,
        locale: input.locale === "ar" ? "AR" : "EN",
        source: input.source,
        utmSource: input.utmSource || null,
        utmMedium: input.utmMedium || null,
        utmCampaign: input.utmCampaign || null,
        referralCodeUsed: quote.referral?.code ?? null,
        status: "QUOTED",
        propertyType: input.propertyType,
        zoneId: input.zoneId || null,
        addressLine: input.addressLine || null,
        bedrooms: input.bedrooms ?? null,
        bathrooms: input.bathrooms ?? null,
        sqm: input.sqm ?? null,
        serviceTypeId: mainService?.id ?? null,
        frequency: input.frequency,
        preferredDate: input.preferredDate ? new Date(input.preferredDate) : null,
        notes: input.notes || null,
        estimateFils: quote.totalFils,
      },
    });

    const createdQuote = await tx.quote.create({
      data: {
        quoteNo,
        leadId: lead.id,
        status: "SENT",
        validUntil,
        frequency: input.frequency,
        subtotalFils: quote.subtotalFils,
        discountFils: quote.discountFils,
        vatRateBps: quote.vatRateBps,
        vatFils: quote.vatFils,
        totalFils: quote.totalFils,
        sentAt: new Date(),
        lines: {
          create: quote.lines.map((line, i) => ({
            descriptionEn: line.nameEn,
            descriptionAr: line.nameAr,
            quantity: line.quantity,
            unitPriceFils: line.unitPriceFils,
            lineTotalFils: line.lineTotalFils,
            sortOrder: i,
          })),
        },
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId: lead.id,
        type: "QUOTE_SENT",
        body: `Website enquiry priced automatically at ${formatMoney(quote.totalFils, "en")} and quote ${quoteNo} issued.`,
      },
    });

    return { lead, createdQuote };
  });

  await recordAudit({
    action: "CREATE",
    entity: "Lead",
    entityId: lead.id,
    summary: `Website enquiry ${lead.referenceNo} from ${input.fullName}`,
    after: { referenceNo: lead.referenceNo, source: input.source, estimateFils: quote.totalFils },
  });

  // ---- Auto-response: PDF, email, WhatsApp -----------------------------------
  const locale = input.locale;
  const frequencyLabel = FREQUENCY_LABELS[input.frequency]?.[locale] ?? input.frequency;

  let pdf: Buffer | null = null;
  try {
    pdf = await renderQuotePdf({
      quoteNo: createdQuote.quoteNo,
      issuedAt: new Date(),
      validUntil,
      locale,
      company: {
        name: org.name,
        nameAr: org.nameAr,
        trn: org.trn,
        addressLines: [org.addressLine1, org.addressLine2, org.city].filter(Boolean) as string[],
        phone: org.phone,
        email: org.email,
        website: org.website,
      },
      customer: {
        name: input.fullName,
        phone: input.phone,
        email: input.email || null,
        address: input.addressLine || null,
      },
      lines: quote.lines.map((l) => ({
        description: locale === "ar" ? l.nameAr : l.nameEn,
        quantity: l.quantity,
        unitPriceFils: l.unitPriceFils,
        lineTotalFils: l.lineTotalFils,
      })),
      subtotalFils: quote.subtotalFils,
      discountFils: quote.discountFils,
      vatRateBps: quote.vatRateBps,
      vatFils: quote.vatFils,
      totalFils: quote.totalFils,
      frequencyLabel,
      notes: null,
    });
  } catch (error) {
    // A missing PDF must not lose us the lead — it is already saved.
    console.error("[lead] Quote PDF generation failed", error);
  }

  const quoteUrl = `${env.appUrl}/${locale}/quote/${createdQuote.id}`;
  const totalText = formatMoney(quote.totalFils, locale);

  let emailSent = false;
  let emailProblem: string | null = null;

  if (input.email) {
    const template = await prisma.messageTemplate.findUnique({ where: { code: "QUOTE_SENT" } });
    const values = {
      name: input.fullName,
      service: locale === "ar" ? quote.lines[0].nameAr : quote.lines[0].nameEn,
      total: totalText,
      validUntil: validUntil.toLocaleDateString(locale === "ar" ? "ar-AE" : "en-AE"),
      quoteNo: createdQuote.quoteNo,
      quoteUrl,
    };
    const subject = fillTemplate(
      (locale === "ar" ? template?.subjectAr : template?.subjectEn) ??
        `Your cleaning quote ${createdQuote.quoteNo}`,
      values,
    );
    const body = fillTemplate(
      (locale === "ar" ? template?.bodyAr : template?.bodyEn) ??
        `Hi {{name}}, your quote for {{service}} is {{total}}, valid until {{validUntil}}.`,
      values,
    );

    const result = await sendEmail({
      to: input.email,
      subject,
      text: `${body}\n\n${quoteUrl}`,
      html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111"${locale === "ar" ? ' dir="rtl"' : ""}>
  <p>${body.replace(/\n/g, "<br>")}</p>
  <p><a href="${quoteUrl}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">
    ${locale === "ar" ? "عرض السعر" : "View your quote"}
  </a></p>
  <p style="color:#666;font-size:13px">${org.name}${org.phone ? ` · ${org.phone}` : ""}</p>
</div>`,
      attachments: pdf
        ? [{ filename: `${createdQuote.quoteNo}.pdf`, content: pdf }]
        : undefined,
      relatedEntity: "Quote",
      relatedId: createdQuote.id,
      templateCode: "QUOTE_SENT",
    });

    emailSent = result.ok;
    if (!result.ok) emailProblem = result.reason;
  } else {
    emailProblem = "No email address was given, so nothing could be emailed.";
  }

  // The WhatsApp link opens with the message already typed, ready to send.
  const waMessage =
    locale === "ar"
      ? `مرحباً ${input.fullName}، شكراً لتواصلك مع ${org.name}. عرض السعر ${createdQuote.quoteNo} بقيمة ${totalText}. التفاصيل هنا: ${quoteUrl}`
      : `Hi ${input.fullName}, thank you for contacting ${org.name}. Your quote ${createdQuote.quoteNo} comes to ${totalText}. Details here: ${quoteUrl}`;

  const whatsappUrl = whatsappLink(input.phone, waMessage);
  if (whatsappUrl) {
    await logWhatsAppLink({
      toPhone: input.phone,
      body: waMessage,
      relatedEntity: "Quote",
      relatedId: createdQuote.id,
      templateCode: "QUOTE_SENT",
    });
  }

  if (!isEmailConfigured()) {
    console.warn(
      "\n!! TODO — AUTO-RESPONSE EMAIL IS OFF.\n" +
        "   RESEND_API_KEY / RESEND_FROM_EMAIL are not set, so lead " +
        `${lead.referenceNo} was saved but no email went out.\n` +
        "   The WhatsApp link still works. See .env.example, Section 3.\n",
    );
  }

  revalidatePath("/[locale]/(office)/leads", "page");

  return {
    ok: true,
    quoteNo: createdQuote.quoteNo,
    referenceNo: lead.referenceNo,
    totalFils: quote.totalFils,
    whatsappUrl,
    emailSent,
    emailProblem,
  };
}
