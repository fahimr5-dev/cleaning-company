import "server-only";
import { prisma } from "@/lib/prisma";
import { averageStars, npsSummary, quarterOf, worstRiskScore } from "@/lib/retention";

/** Everything the Retention screen shows, in one place. */

export type RiskRow = {
  clientId: string;
  clientName: string;
  clientNo: string;
  phone: string;
  worstScore: number;
  lastJobAt: string | null;
  lifetimeValueFils: number;
  flags: Array<{
    id: string;
    reason: string;
    detail: string;
    score: number;
    suggestedAction: string;
    detectedAt: string;
  }>;
};

export async function getClientsAtRisk(limit = 25): Promise<RiskRow[]> {
  const flags = await prisma.clientRiskFlag.findMany({
    where: { status: "OPEN", client: { deletedAt: null } },
    orderBy: [{ score: "desc" }, { detectedAt: "desc" }],
    take: 200,
    select: {
      id: true, reason: true, detail: true, score: true,
      suggestedAction: true, detectedAt: true,
      client: {
        select: {
          id: true, clientNo: true, contactName: true, companyName: true,
          phone: true, lastJobAt: true,
          invoices: {
            where: { deletedAt: null, status: { not: "VOID" } },
            select: { totalFils: true },
          },
        },
      },
    },
  });

  const byClient = new Map<string, RiskRow>();
  for (const flag of flags) {
    const client = flag.client;
    const row = byClient.get(client.id) ?? {
      clientId: client.id,
      clientName: client.companyName ?? client.contactName,
      clientNo: client.clientNo,
      phone: client.phone,
      worstScore: 0,
      lastJobAt: client.lastJobAt?.toISOString() ?? null,
      lifetimeValueFils: client.invoices.reduce((t, i) => t + i.totalFils, 0),
      flags: [],
    };
    row.flags.push({
      id: flag.id,
      reason: flag.reason,
      detail: flag.detail,
      score: flag.score,
      suggestedAction: flag.suggestedAction,
      detectedAt: flag.detectedAt.toISOString(),
    });
    row.worstScore = worstRiskScore(row.flags);
    byClient.set(client.id, row);
  }

  return [...byClient.values()]
    .sort((a, b) => b.worstScore - a.worstScore)
    .slice(0, limit);
}

export type RatingRow = {
  id: string;
  stars: number;
  comment: string | null;
  submittedAt: string;
  jobNo: string;
  clientId: string;
  clientName: string;
  ticketNo: string | null;
  ticketStatus: string | null;
};

/** The most recent ratings, plus the numbers above them. */
export async function getRatingFeed(options: { onlyLow?: boolean; limit?: number } = {}) {
  const limit = options.limit ?? 20;
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

  const org = await prisma.organization.findFirst({
    select: { reCleanRatingThreshold: true, googleReviewUrl: true },
  });
  const threshold = org?.reCleanRatingThreshold ?? 4;

  const [recent, all90, awaiting, googleShown, googleClicked] = await Promise.all([
    prisma.rating.findMany({
      where: {
        submittedAt: { not: null },
        ...(options.onlyLow ? { stars: { lt: threshold, gt: 0 } } : {}),
      },
      orderBy: { submittedAt: "desc" },
      take: limit,
      select: {
        id: true, stars: true, comment: true, submittedAt: true,
        job: { select: { jobNo: true } },
        client: { select: { id: true, contactName: true, companyName: true } },
        ticket: { select: { ticketNo: true, status: true } },
      },
    }),
    prisma.rating.findMany({
      where: { submittedAt: { gte: ninetyDaysAgo } },
      select: { stars: true },
    }),
    prisma.rating.count({ where: { submittedAt: null, requestSentAt: { not: null } } }),
    prisma.rating.count({ where: { googleReviewShownAt: { not: null } } }),
    prisma.rating.count({ where: { googleReviewClickedAt: { not: null } } }),
  ]);

  return {
    threshold,
    googleReviewUrl: org?.googleReviewUrl ?? null,
    averageStars: averageStars(all90),
    ratedLast90: all90.length,
    lowCount: all90.filter((r) => r.stars > 0 && r.stars < threshold).length,
    awaitingReply: awaiting,
    googleShown,
    googleClicked,
    rows: recent.map((r): RatingRow => ({
      id: r.id,
      stars: r.stars,
      comment: r.comment,
      submittedAt: r.submittedAt!.toISOString(),
      jobNo: r.job.jobNo,
      clientId: r.client.id,
      clientName: r.client.companyName ?? r.client.contactName,
      ticketNo: r.ticket?.ticketNo ?? null,
      ticketStatus: r.ticket?.status ?? null,
    })),
  };
}

/** This quarter's NPS against last quarter's. */
export async function getNpsBoard(now = new Date()) {
  const thisQuarter = quarterOf(now);
  const lastQuarter = quarterOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 15)));

  const [current, previous, comments] = await Promise.all([
    prisma.npsResponse.findMany({ where: { quarter: thisQuarter }, select: { score: true } }),
    prisma.npsResponse.findMany({ where: { quarter: lastQuarter }, select: { score: true } }),
    prisma.npsResponse.findMany({
      where: { quarter: thisQuarter, comment: { not: null } },
      orderBy: { respondedAt: "desc" },
      take: 5,
      select: {
        score: true, comment: true, respondedAt: true,
        client: { select: { id: true, contactName: true, companyName: true } },
      },
    }),
  ]);

  return {
    quarter: thisQuarter,
    lastQuarter,
    current: npsSummary(current),
    previous: npsSummary(previous),
    outstanding: current.filter((r) => r.score === null).length,
    comments: comments.map((c) => ({
      score: c.score ?? 0,
      comment: c.comment ?? "",
      clientId: c.client.id,
      clientName: c.client.companyName ?? c.client.contactName,
      respondedAt: c.respondedAt?.toISOString() ?? null,
    })),
  };
}

/** Who has brought you the most business by recommending you. */
export async function getReferralBoard(limit = 10) {
  const [referrals, totals] = await Promise.all([
    prisma.referral.findMany({
      orderBy: [{ attributedRevenueFils: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true, code: true, status: true, attributedRevenueFils: true,
        referrerRewardFils: true, refereeDiscountFils: true, createdAt: true,
        referrerClient: { select: { id: true, contactName: true, companyName: true } },
        refereeClient: { select: { id: true, contactName: true, companyName: true } },
        refereeLead: { select: { fullName: true } },
      },
    }),
    prisma.referral.groupBy({
      by: ["status"],
      _count: true,
      _sum: { attributedRevenueFils: true, referrerRewardFils: true, refereeDiscountFils: true },
    }),
  ]);

  const rewardedFils = totals.reduce(
    (t, g) => t + (g._sum.referrerRewardFils ?? 0) + (g._sum.refereeDiscountFils ?? 0),
    0,
  );

  return {
    counts: Object.fromEntries(totals.map((g) => [g.status, g._count])) as Record<string, number>,
    total: totals.reduce((t, g) => t + g._count, 0),
    attributedRevenueFils: totals.reduce((t, g) => t + (g._sum.attributedRevenueFils ?? 0), 0),
    rewardedFils,
    rows: referrals.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      referrerId: r.referrerClient.id,
      referrerName: r.referrerClient.companyName ?? r.referrerClient.contactName,
      refereeName:
        r.refereeClient?.companyName ??
        r.refereeClient?.contactName ??
        r.refereeLead?.fullName ??
        null,
      refereeId: r.refereeClient?.id ?? null,
      attributedRevenueFils: r.attributedRevenueFils,
      rewardFils: r.referrerRewardFils + r.refereeDiscountFils,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/** Campaigns, newest first, with how each one actually performed. */
export async function getCampaigns(limit = 10) {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, name: true, type: true, channel: true, status: true,
      createdAt: true, approvedAt: true, sentAt: true,
      recipients: { select: { status: true, convertedJobId: true } },
    },
  });

  return campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    channel: c.channel,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
    sentAt: c.sentAt?.toISOString() ?? null,
    recipients: c.recipients.length,
    sent: c.recipients.filter((r) => r.status === "SENT").length,
    failed: c.recipients.filter((r) => r.status === "FAILED").length,
    converted: c.recipients.filter((r) => r.convertedJobId).length,
  }));
}
