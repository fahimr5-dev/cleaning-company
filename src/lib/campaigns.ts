import "server-only";
import { prisma } from "@/lib/prisma";
import { sendEmail, logWhatsAppLink } from "@/lib/email";
import { fillTemplate } from "@/lib/whatsapp";
import { recordAudit } from "@/lib/audit";
import { winbackEligible } from "@/lib/retention";
import { env } from "@/lib/env";

/**
 * Batch messages to clients — win-back offers, promotions, referral nudges.
 *
 * PLAIN ENGLISH: a campaign is built as a draft with a named list of people,
 * and NOT ONE MESSAGE is sent until somebody approves it. That is deliberate:
 * a bug that emails your whole client list the wrong offer is expensive and
 * cannot be taken back.
 */

const DAY_MS = 86_400_000;

export type CampaignAudience = {
  clientId: string;
  name: string;
  daysSinceLastJob: number | null;
  lifetimeValueFils: number;
  reason: string;
};

/**
 * Who a win-back campaign would go to, worked out but not yet saved.
 *
 * The screen shows this list before anything is created, so the owner sees
 * exactly who they are about to message.
 */
export async function winbackAudience(options: { now?: Date } = {}): Promise<CampaignAudience[]> {
  const now = options.now ?? new Date();
  const org = await prisma.organization.findFirst();
  if (!org) return [];

  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "PAUSED", "CHURNED"] } },
    select: {
      id: true, contactName: true, companyName: true, email: true, phone: true,
      whatsappPhone: true, isBookingPaused: true, lastJobAt: true,
      invoices: {
        where: { deletedAt: null, status: { not: "VOID" } },
        select: { totalFils: true },
      },
      campaignRecipients: {
        where: { status: "SENT" },
        orderBy: { sentAt: "desc" },
        take: 1,
        select: { sentAt: true },
      },
    },
  });

  const audience: CampaignAudience[] = [];

  for (const client of clients) {
    const daysSinceLastJob = client.lastJobAt
      ? Math.floor((now.getTime() - client.lastJobAt.getTime()) / DAY_MS)
      : null;
    const lastCampaignAt = client.campaignRecipients[0]?.sentAt ?? null;

    const check = winbackEligible({
      daysSinceLastJob,
      inactiveDays: org.winbackInactiveDays,
      daysSinceLastCampaign: lastCampaignAt
        ? Math.floor((now.getTime() - lastCampaignAt.getTime()) / DAY_MS)
        : null,
      isBookingPaused: client.isBookingPaused,
      hasEmail: Boolean(client.email),
      hasPhone: Boolean(client.phone ?? client.whatsappPhone),
    });
    if (!check.eligible) continue;

    audience.push({
      clientId: client.id,
      name: client.companyName ?? client.contactName,
      daysSinceLastJob,
      lifetimeValueFils: client.invoices.reduce((total, i) => total + i.totalFils, 0),
      reason: `Quiet for ${daysSinceLastJob} days`,
    });
  }

  return audience.sort((a, b) => b.lifetimeValueFils - a.lifetimeValueFils);
}

/**
 * Creates the campaign as a DRAFT with its recipient list attached.
 *
 * Nothing is sent here. `sendCampaign` refuses to run until the campaign has
 * been approved.
 */
export async function createCampaign(input: {
  type: "WINBACK" | "NPS" | "PROMO" | "REFERRAL_PUSH";
  name: string;
  channel: "EMAIL" | "WHATSAPP" | "BOTH";
  templateCode: string;
  clientIds: string[];
  createdById: string;
}): Promise<{ id: string; recipients: number }> {
  const template = await prisma.messageTemplate.findUnique({
    where: { code: input.templateCode },
    select: { id: true },
  });

  const campaign = await prisma.campaign.create({
    data: {
      type: input.type,
      name: input.name,
      channel: input.channel,
      templateId: template?.id ?? null,
      status: "DRAFT",
      createdById: input.createdById,
      recipients: {
        create: input.clientIds.map((clientId) => ({ clientId, status: "PENDING" as const })),
      },
    },
    select: { id: true, _count: { select: { recipients: true } } },
  });

  await recordAudit({
    action: "CREATE",
    entity: "Campaign",
    entityId: campaign.id,
    summary: `Campaign "${input.name}" drafted for ${campaign._count.recipients} clients — not sent yet`,
  });

  return { id: campaign.id, recipients: campaign._count.recipients };
}

export type CampaignSendResult = {
  sent: number;
  failed: number;
  skipped: number;
  problems: string[];
};

/**
 * Sends an APPROVED campaign, one message per recipient.
 *
 * Refuses outright on anything not approved. A recipient already marked SENT is
 * skipped, so a half-finished run can be restarted without double-messaging.
 */
export async function sendCampaign(campaignId: string): Promise<CampaignSendResult> {
  const result: CampaignSendResult = { sent: 0, failed: 0, skipped: 0, problems: [] };

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      template: true,
      recipients: {
        include: {
          client: {
            select: {
              id: true, contactName: true, companyName: true, email: true,
              phone: true, whatsappPhone: true, locale: true, referralCode: true,
            },
          },
        },
      },
    },
  });

  if (!campaign) {
    result.problems.push("That campaign no longer exists.");
    return result;
  }
  if (campaign.status !== "APPROVED") {
    result.problems.push(
      `This campaign is ${campaign.status}. Nothing is sent until it is approved.`,
    );
    return result;
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "SENDING" },
  });

  for (const recipient of campaign.recipients) {
    if (recipient.status === "SENT") {
      result.skipped += 1;
      continue;
    }

    const client = recipient.client;
    const locale = client.locale === "AR" ? "ar" : "en";
    const values = {
      name: client.companyName ?? client.contactName,
      offerLink: `${env.appUrl}/${locale}#quote`,
      referralCode: client.referralCode,
      referralLink: `${env.appUrl}/${locale}?ref=${client.referralCode}`,
    };

    const subject = fillTemplate(
      (locale === "ar" ? campaign.template?.subjectAr : campaign.template?.subjectEn) ??
        campaign.name,
      values,
    );
    const body = fillTemplate(
      (locale === "ar" ? campaign.template?.bodyAr : campaign.template?.bodyEn) ??
        "Hi {{name}}, we would love to see you again. {{offerLink}}",
      values,
    );

    let delivered = false;
    let problem: string | null = null;

    if (campaign.channel !== "WHATSAPP" && client.email) {
      const sent = await sendEmail({
        to: client.email,
        subject,
        text: body,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6"${locale === "ar" ? ' dir="rtl"' : ""}>
  <p>${body.replace(/\n/g, "<br>")}</p>
</div>`,
        relatedEntity: "Campaign",
        relatedId: campaign.id,
        clientId: client.id,
      });
      delivered = sent.ok;
      if (!sent.ok) problem = sent.reason;
    }

    // The WhatsApp link is always produced when a phone exists: it costs
    // nothing, and it is what most UAE clients actually read.
    const phone = client.whatsappPhone ?? client.phone;
    if (campaign.channel !== "EMAIL" && phone) {
      await logWhatsAppLink({
        toPhone: phone, body,
        relatedEntity: "Campaign", relatedId: campaign.id, clientId: client.id,
      });
      delivered = true;
    }

    if (!delivered && !problem) {
      problem = "No usable email or phone for this client.";
    }

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: delivered ? "SENT" : "FAILED",
        sentAt: delivered ? new Date() : null,
        error: delivered ? null : problem,
      },
    });

    if (delivered) result.sent += 1;
    else {
      result.failed += 1;
      result.problems.push(`${values.name}: ${problem}`);
    }
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "SENT", sentAt: new Date() },
  });

  await recordAudit({
    action: "SEND",
    entity: "Campaign",
    entityId: campaignId,
    summary: `Campaign "${campaign.name}" sent to ${result.sent} clients (${result.failed} failed)`,
  });

  return result;
}

/**
 * Credits a campaign with a booking.
 *
 * Called when a client books after being messaged: if they were on a campaign
 * in the last 30 days, that campaign gets the credit. This is what makes
 * "did the win-back offer actually work?" an answerable question.
 */
export async function attributeBookingToCampaign(input: {
  clientId: string;
  jobId: string;
  now?: Date;
  windowDays?: number;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const since = new Date(now.getTime() - (input.windowDays ?? 30) * DAY_MS);

  const recipient = await prisma.campaignRecipient.findFirst({
    where: {
      clientId: input.clientId,
      status: "SENT",
      sentAt: { gte: since },
      convertedJobId: null,
    },
    orderBy: { sentAt: "desc" },
    select: { id: true },
  });
  if (!recipient) return false;

  await prisma.campaignRecipient.update({
    where: { id: recipient.id },
    data: { convertedJobId: input.jobId },
  });
  return true;
}
