"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { detectChurnRisk } from "@/lib/churn";
import { winbackAudience, createCampaign, sendCampaign } from "@/lib/campaigns";
import { sendRatingRequests } from "@/lib/ratings";
import { sendNpsSurveys } from "@/lib/nps";
import { sweepPendingReferrals } from "@/lib/referrals";

/**
 * The buttons on the Retention screen.
 *
 * Reading and acting on retention is an operations job, so office roles can do
 * most of this. Sending a campaign is the exception: it costs money and reaches
 * every customer at once, so it is OWNER-only and needs an explicit approval
 * step before a single message goes out.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const localeSchema = z.object({ locale: z.string().max(5).default("en") });

/** Rebuilds the "who looks like they are leaving" list from current data. */
export async function rebuildRiskAction(
  raw: unknown,
): Promise<Result<{ clientsChecked: number; flagsOpened: number; flagsClosed: number }>> {
  const parsed = localeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);
  const result = await detectChurnRisk();

  revalidatePath(`/${locale}/retention`);
  return {
    ok: true,
    clientsChecked: result.clientsChecked,
    flagsOpened: result.flagsOpened,
    flagsClosed: result.flagsClosed,
  };
}

const flagSchema = z.object({
  flagId: z.string().uuid(),
  outcome: z.enum(["DISMISSED", "ACTIONED"]),
  note: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/** Closes one warning, with a note saying what was done about it. */
export async function resolveRiskFlagAction(raw: unknown): Promise<Result> {
  const parsed = flagSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { flagId, outcome, note, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const flag = await prisma.clientRiskFlag.findUnique({
    where: { id: flagId },
    select: { id: true, status: true, reason: true, client: { select: { clientNo: true } } },
  });
  if (!flag) return { ok: false, error: "That warning no longer exists." };
  if (flag.status !== "OPEN") return { ok: false, error: "That warning is already closed." };

  await prisma.clientRiskFlag.update({
    where: { id: flagId },
    data: {
      status: outcome,
      resolvedAt: new Date(),
      resolvedById: user.id,
      resolutionNote: note || null,
    },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "ClientRiskFlag",
    entityId: flagId,
    summary: `${flag.client.clientNo}: ${flag.reason} warning marked ${outcome.toLowerCase()}`,
  });

  revalidatePath(`/${locale}/retention`);
  return { ok: true };
}

/** Who a win-back campaign would reach — shown before anything is created. */
export async function previewWinbackAction(
  raw: unknown,
): Promise<Result<{ audience: Awaited<ReturnType<typeof winbackAudience>> }>> {
  const parsed = localeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };

  await requireRole(parsed.data.locale, ...OFFICE_ROLES);
  return { ok: true, audience: await winbackAudience() };
}

const createSchema = z.object({
  name: z.string().trim().min(3, "Give the campaign a name.").max(120),
  type: z.enum(["WINBACK", "PROMO", "REFERRAL_PUSH"]),
  channel: z.enum(["EMAIL", "WHATSAPP", "BOTH"]).default("BOTH"),
  templateCode: z.string().trim().max(60),
  clientIds: z.array(z.string().uuid()).min(1, "Choose at least one client.").max(2000),
  locale: z.string().max(5).default("en"),
});

/** Creates the campaign as a draft. Sends nothing. */
export async function createCampaignAction(
  raw: unknown,
): Promise<Result<{ campaignId: string; recipients: number }>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That campaign was not valid." };
  }
  const { name, type, channel, templateCode, clientIds, locale } = parsed.data;

  const user = await requireRole(locale, "OWNER");

  const campaign = await createCampaign({
    type, name, channel, templateCode, clientIds, createdById: user.id,
  });

  revalidatePath(`/${locale}/retention`);
  return { ok: true, campaignId: campaign.id, recipients: campaign.recipients };
}

const approveSchema = z.object({
  campaignId: z.string().uuid(),
  locale: z.string().max(5).default("en"),
});

/**
 * Approves a draft campaign and then sends it.
 *
 * Approval and sending are one deliberate action by the owner, but they remain
 * two states in the database: a campaign that fails halfway through is APPROVED
 * and half-sent, and restarting it skips whoever already received it.
 */
export async function approveAndSendCampaignAction(
  raw: unknown,
): Promise<Result<{ sent: number; failed: number; skipped: number; problems: string[] }>> {
  const parsed = approveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { campaignId, locale } = parsed.data;

  const user = await requireRole(locale, "OWNER");

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true, _count: { select: { recipients: true } } },
  });
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };
  if (campaign.status === "SENT") return { ok: false, error: "That campaign has already been sent." };
  if (campaign.status === "CANCELLED") return { ok: false, error: "That campaign was cancelled." };
  if (campaign._count.recipients === 0) {
    return { ok: false, error: "That campaign has nobody in it." };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "APPROVED", approvedById: user.id, approvedAt: new Date() },
  });

  await recordAudit({
    action: "APPROVE",
    entity: "Campaign",
    entityId: campaignId,
    summary: `Campaign "${campaign.name}" approved for ${campaign._count.recipients} clients`,
  });

  const result = await sendCampaign(campaignId);

  revalidatePath(`/${locale}/retention`);
  return { ok: true, ...result };
}

const cancelSchema = approveSchema;

/** Cancels a draft campaign before anything is sent. */
export async function cancelCampaignAction(raw: unknown): Promise<Result> {
  const parsed = cancelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { campaignId, locale } = parsed.data;

  await requireRole(locale, "OWNER");

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, name: true, status: true },
  });
  if (!campaign) return { ok: false, error: "That campaign no longer exists." };
  if (campaign.status === "SENT" || campaign.status === "SENDING") {
    return { ok: false, error: "That campaign has already gone out — it cannot be cancelled now." };
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: "CANCELLED" },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Campaign",
    entityId: campaignId,
    summary: `Campaign "${campaign.name}" cancelled before sending`,
  });

  revalidatePath(`/${locale}/retention`);
  return { ok: true };
}

/**
 * Sends the rating requests, surveys and referral payouts that are due right
 * now, instead of waiting for the nightly job. Nothing is ever sent twice.
 */
export async function runRetentionNowAction(
  raw: unknown,
): Promise<Result<{ ratingsSent: number; surveysSent: number; referralsRewarded: number; problems: string[] }>> {
  const parsed = localeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { locale } = parsed.data;

  await requireRole(locale, "OWNER");

  const ratings = await sendRatingRequests();
  const nps = await sendNpsSurveys();
  const referrals = await sweepPendingReferrals();

  revalidatePath(`/${locale}/retention`);
  return {
    ok: true,
    ratingsSent: ratings.sent,
    surveysSent: nps.sent,
    referralsRewarded: referrals.rewarded,
    problems: [...ratings.problems, ...nps.problems].slice(0, 5),
  };
}
