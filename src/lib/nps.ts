import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, logWhatsAppLink } from "@/lib/email";
import { fillTemplate } from "@/lib/whatsapp";
import { recordAudit } from "@/lib/audit";
import { npsSummary, quarterOf, npsDue } from "@/lib/retention";
import { env } from "@/lib/env";

/**
 * The quarterly "would you recommend us?" survey.
 *
 * PLAIN ENGLISH: a rating tells you how one clean went. This tells you how the
 * relationship is going. One question, 0 to 10, once a quarter at most — asking
 * more often than that annoys people and stops working.
 */

function newToken(): string {
  return randomBytes(16).toString("hex");
}

export type NpsSendResult = {
  eligible: number;
  created: number;
  sent: number;
  failed: number;
  quarter: string;
  problems: string[];
};

/**
 * Sends this quarter's survey to every active client who is due one.
 *
 * Safe to run repeatedly: one row per client per quarter, enforced by the
 * database, and a survey already sent is never sent again.
 */
export async function sendNpsSurveys(options: { now?: Date; dryRun?: boolean } = {}): Promise<NpsSendResult> {
  const now = options.now ?? new Date();
  const quarter = quarterOf(now);
  const result: NpsSendResult = {
    eligible: 0, created: 0, sent: 0, failed: 0, quarter, problems: [],
  };

  const org = await prisma.organization.findFirst();
  if (!org) {
    result.problems.push("No company settings, so no surveys were sent.");
    return result;
  }

  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: "ACTIVE" },
    select: {
      id: true, contactName: true, companyName: true, email: true,
      phone: true, whatsappPhone: true, locale: true,
      npsResponses: {
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { quarter: true, sentAt: true },
      },
    },
  });

  const template = await prisma.messageTemplate.findUnique({ where: { code: "NPS_SURVEY" } });

  for (const client of clients) {
    const lastSentAt = client.npsResponses.find((r) => r.sentAt)?.sentAt ?? null;
    const due = npsDue({
      lastSentAt,
      intervalDays: org.npsIntervalDays,
      now,
      quartersAlreadySent: client.npsResponses.map((r) => r.quarter),
    });
    if (!due) continue;
    if (!client.email && !client.phone && !client.whatsappPhone) {
      result.problems.push(`${client.companyName ?? client.contactName}: no email or phone on file.`);
      continue;
    }

    result.eligible += 1;
    if (options.dryRun) continue;

    const response = await prisma.npsResponse.create({
      data: { clientId: client.id, quarter, token: newToken() },
      select: { id: true, token: true },
    });
    result.created += 1;

    const locale = client.locale === "AR" ? "ar" : "en";
    const values = {
      name: client.companyName ?? client.contactName,
      surveyLink: `${env.appUrl}/${locale}/nps/${response.token}`,
    };
    const subject = fillTemplate(
      (locale === "ar" ? template?.subjectAr : template?.subjectEn) ??
        "One quick question", values);
    const body = fillTemplate(
      (locale === "ar" ? template?.bodyAr : template?.bodyEn) ??
        "Hi {{name}}, how likely are you to recommend us to a friend? {{surveyLink}}",
      values,
    );

    let delivered = false;
    if (client.email) {
      const sent = await sendEmail({
        to: client.email,
        subject,
        text: body,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6"${locale === "ar" ? ' dir="rtl"' : ""}>
  <p>${body.replace(/\n/g, "<br>")}</p>
  <p><a href="${values.surveyLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${locale === "ar" ? "أجب في ثانية" : "Answer in one tap"}</a></p>
</div>`,
        relatedEntity: "NpsResponse",
        relatedId: response.id,
        clientId: client.id,
        templateCode: "NPS_SURVEY",
      });
      delivered = sent.ok;
      if (!sent.ok) result.problems.push(`${values.name}: ${sent.reason}`);
    }

    const phone = client.whatsappPhone ?? client.phone;
    if (phone) {
      await logWhatsAppLink({
        toPhone: phone, body,
        relatedEntity: "NpsResponse", relatedId: response.id,
        clientId: client.id, templateCode: "NPS_SURVEY",
      });
    }

    await prisma.npsResponse.update({
      where: { id: response.id },
      data: { sentAt: now },
    });

    if (delivered) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}

export type SubmitNpsResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" | "ALREADY_ANSWERED" };

export async function submitNpsResponse(input: {
  token: string;
  score: number;
  comment: string | null;
}): Promise<SubmitNpsResult> {
  const response = await prisma.npsResponse.findUnique({
    where: { token: input.token },
    select: {
      id: true, respondedAt: true, quarter: true,
      client: { select: { id: true, contactName: true, companyName: true } },
    },
  });
  if (!response) return { ok: false, error: "NOT_FOUND" };
  if (response.respondedAt) return { ok: false, error: "ALREADY_ANSWERED" };

  await prisma.npsResponse.update({
    where: { id: response.id },
    data: {
      score: input.score,
      comment: input.comment?.trim() || null,
      respondedAt: new Date(),
    },
  });

  await recordAudit({
    action: "CREATE",
    entity: "NpsResponse",
    entityId: response.id,
    summary:
      `${response.client.companyName ?? response.client.contactName} scored ` +
      `${input.score}/10 in the ${response.quarter} survey`,
  });

  return { ok: true };
}

/** This quarter's score, and the previous quarter's, so the screen can compare. */
export async function npsScoreboard(now = new Date()) {
  const thisQuarter = quarterOf(now);
  const previous = quarterOf(new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() - 3,
    15,
  )));

  const [current, before] = await Promise.all([
    prisma.npsResponse.findMany({ where: { quarter: thisQuarter }, select: { score: true } }),
    prisma.npsResponse.findMany({ where: { quarter: previous }, select: { score: true } }),
  ]);

  return {
    quarter: thisQuarter,
    previousQuarter: previous,
    current: npsSummary(current),
    previous: npsSummary(before),
    outstanding: current.filter((r) => r.score === null).length,
  };
}
