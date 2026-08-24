import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendEmail, logWhatsAppLink } from "@/lib/email";
import { fillTemplate } from "@/lib/whatsapp";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-number";
import { ratingOutcome, ratingRequestDueAt } from "@/lib/retention";
import { env } from "@/lib/env";

/**
 * Asking every client how the clean went, and doing something with the answer.
 *
 * PLAIN ENGLISH: when a job finishes, a rating request is prepared with its own
 * secret link. A couple of hours later — long enough for the client to have
 * seen the flat, short enough to still remember it — the message goes out. Five
 * stars gets asked for a Google review. Anything below your threshold opens a
 * complaint ticket automatically, so a bad clean cannot quietly disappear.
 */

/** A 128-bit secret in the rating link, so nobody can rate on someone's behalf. */
function newToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Prepares the rating request for a finished job. Does not send anything yet —
 * the message goes out later, once the delay in your settings has passed.
 *
 * Safe to call twice: a job has at most one rating.
 */
export async function prepareRatingRequest(
  jobId: string,
  tx?: Prisma.TransactionClient,
): Promise<{ created: boolean; ratingId: string | null }> {
  const db = tx ?? prisma;

  const job = await db.job.findFirst({
    where: { id: jobId, deletedAt: null },
    select: { id: true, clientId: true, status: true, rating: { select: { id: true } } },
  });
  if (!job) return { created: false, ratingId: null };
  if (job.rating) return { created: false, ratingId: job.rating.id };
  if (job.status !== "COMPLETED") return { created: false, ratingId: null };

  const rating = await db.rating.create({
    data: {
      jobId: job.id,
      clientId: job.clientId,
      // Zero means "not rated yet". submittedAt is what says whether they answered.
      stars: 0,
      token: newToken(),
    },
    select: { id: true },
  });

  return { created: true, ratingId: rating.id };
}

export type RatingSendResult = {
  due: number;
  sent: number;
  failed: number;
  problems: string[];
};

/**
 * Sends every rating request that is now due.
 *
 * Safe to run as often as you like: `requestSentAt` is stamped once, and a
 * request already sent is never sent again.
 */
export async function sendRatingRequests(options: { now?: Date } = {}): Promise<RatingSendResult> {
  const now = options.now ?? new Date();
  const result: RatingSendResult = { due: 0, sent: 0, failed: 0, problems: [] };

  const org = await prisma.organization.findFirst();
  if (!org) {
    result.problems.push("No company settings, so no rating requests were sent.");
    return result;
  }

  const waiting = await prisma.rating.findMany({
    where: { requestSentAt: null, submittedAt: null },
    take: 200,
    orderBy: { createdAt: "asc" },
    select: {
      id: true, token: true,
      job: { select: { id: true, jobNo: true, actualEnd: true, scheduledEnd: true, status: true } },
      client: {
        select: {
          id: true, contactName: true, companyName: true, email: true,
          phone: true, whatsappPhone: true, locale: true,
        },
      },
    },
  });

  const template = await prisma.messageTemplate.findUnique({ where: { code: "RATING_REQUEST" } });

  for (const rating of waiting) {
    const finished = rating.job.actualEnd ?? rating.job.scheduledEnd;
    if (rating.job.status !== "COMPLETED") continue;
    if (ratingRequestDueAt(finished, org.ratingRequestDelayMinutes) > now) continue;

    result.due += 1;

    const client = rating.client;
    const locale = client.locale === "AR" ? "ar" : "en";
    const values = {
      name: client.companyName ?? client.contactName,
      ratingLink: `${env.appUrl}/${locale}/rate/${rating.token}`,
      jobNo: rating.job.jobNo,
    };

    const subject = fillTemplate(
      (locale === "ar" ? template?.subjectAr : template?.subjectEn) ?? "How did we do?",
      values,
    );
    const body = fillTemplate(
      (locale === "ar" ? template?.bodyAr : template?.bodyEn) ??
        "Hi {{name}}, how was today's clean? Tap to rate us: {{ratingLink}}",
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
  <p><a href="${values.ratingLink}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">${locale === "ar" ? "قيّم الخدمة" : "Rate this clean"}</a></p>
</div>`,
        relatedEntity: "Rating",
        relatedId: rating.id,
        clientId: client.id,
        templateCode: "RATING_REQUEST",
      });
      delivered = sent.ok;
      if (!sent.ok) result.problems.push(`${rating.job.jobNo}: ${sent.reason}`);
    } else {
      result.problems.push(`${rating.job.jobNo}: the client has no email address.`);
    }

    // The WhatsApp link is produced either way — it costs nothing and it is how
    // most UAE clients actually reply.
    const phone = client.whatsappPhone ?? client.phone;
    if (phone) {
      await logWhatsAppLink({
        toPhone: phone,
        body,
        relatedEntity: "Rating",
        relatedId: rating.id,
        clientId: client.id,
        templateCode: "RATING_REQUEST",
      });
    }

    await prisma.rating.update({
      where: { id: rating.id },
      data: { requestSentAt: now },
    });

    if (delivered) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}

export type SubmitRatingResult =
  | { ok: true; askForGoogleReview: boolean; googleReviewUrl: string | null; ticketNo: string | null }
  | { ok: false; error: "NOT_FOUND" | "ALREADY_RATED" | "BAD_STARS" };

/**
 * Records what the client said, and reacts to it.
 *
 * A rating below your re-clean threshold opens a complaint ticket there and
 * then, with the severity set by how bad it was. One star is treated as
 * critical, because in this business that usually means nobody turned up.
 */
export async function submitRating(input: {
  token: string;
  stars: number;
  punctualityStars?: number | null;
  qualityStars?: number | null;
  comment?: string | null;
}): Promise<SubmitRatingResult> {
  if (!Number.isInteger(input.stars) || input.stars < 1 || input.stars > 5) {
    return { ok: false, error: "BAD_STARS" };
  }

  const org = await prisma.organization.findFirst();
  const threshold = org?.reCleanRatingThreshold ?? 4;

  const rating = await prisma.rating.findUnique({
    where: { token: input.token },
    select: {
      id: true, submittedAt: true, clientId: true,
      job: { select: { id: true, jobNo: true } },
      client: { select: { contactName: true, companyName: true } },
    },
  });
  if (!rating) return { ok: false, error: "NOT_FOUND" };
  if (rating.submittedAt) return { ok: false, error: "ALREADY_RATED" };

  const outcome = ratingOutcome(input.stars, threshold);

  const ticketNo = await prisma.$transaction(async (tx) => {
    await tx.rating.update({
      where: { id: rating.id },
      data: {
        stars: input.stars,
        punctualityStars: input.punctualityStars ?? null,
        qualityStars: input.qualityStars ?? null,
        comment: input.comment?.trim() || null,
        submittedAt: new Date(),
        googleReviewShownAt: outcome.askForGoogleReview ? new Date() : null,
      },
    });

    if (!outcome.opensTicket) return null;

    const no = await nextDocumentNumber(tx, "TKT");
    await tx.ticket.create({
      data: {
        ticketNo: no,
        type: "LOW_RATING",
        severity: outcome.severity,
        status: "OPEN",
        jobId: rating.job.id,
        clientId: rating.clientId,
        ratingId: rating.id,
        subject: `${input.stars}-star rating on ${rating.job.jobNo}`,
        description: input.comment?.trim() || "Low rating received, no comment left.",
      },
    });
    return no;
  });

  await recordAudit({
    action: "CREATE",
    entity: "Rating",
    entityId: rating.id,
    summary:
      `${rating.client.companyName ?? rating.client.contactName} rated ${rating.job.jobNo} ` +
      `${input.stars}/5` + (ticketNo ? ` — ticket ${ticketNo} opened` : ""),
  });

  return {
    ok: true,
    askForGoogleReview: outcome.askForGoogleReview && Boolean(org?.googleReviewUrl),
    googleReviewUrl: outcome.askForGoogleReview ? (org?.googleReviewUrl ?? null) : null,
    ticketNo,
  };
}

/** Records that the client actually clicked through to Google, for the report. */
export async function markGoogleReviewClicked(token: string): Promise<void> {
  await prisma.rating.updateMany({
    where: { token, googleReviewClickedAt: null },
    data: { googleReviewClickedAt: new Date() },
  });
}
