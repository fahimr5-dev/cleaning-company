import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { referralQualifies, referralRewardFils, type DiscountType } from "@/lib/retention";
import { formatMoney } from "@/lib/money";

/**
 * Turning "my neighbour told me about you" into money on both sides.
 *
 * PLAIN ENGLISH: every client has a code. When somebody uses it and then
 * actually completes AND pays their first clean, both people get their reward
 * as credit on their account, which comes off their next invoice automatically.
 *
 * The bar is deliberately "completed and paid". Rewarding on booking alone
 * invites people to refer themselves, book, and cancel.
 */

export type ReferralOutcome =
  | { kind: "REWARDED"; referralId: string; referrerFils: number; refereeFils: number }
  | { kind: "NOT_YET"; reason: string }
  | { kind: "NO_REFERRAL" };

/**
 * Checks the referral behind a just-completed job and pays it out if it has
 * earned it. Safe to call twice — a rewarded referral is never rewarded again.
 */
export async function qualifyReferralForJob(jobId: string): Promise<ReferralOutcome> {
  const job = await prisma.job.findFirst({
    where: { id: jobId, deletedAt: null },
    select: {
      id: true, jobNo: true, clientId: true, status: true, totalFils: true,
      invoice: { select: { id: true, status: true, balanceFils: true } },
      packageUsage: { select: { id: true } },
    },
  });
  if (!job) return { kind: "NO_REFERRAL" };

  const referral = await prisma.referral.findFirst({
    where: { refereeClientId: job.clientId },
    select: {
      id: true, status: true, referrerClientId: true, refereeClientId: true,
      qualifyingJobId: true, attributedRevenueFils: true,
    },
  });
  if (!referral) return { kind: "NO_REFERRAL" };

  // Lifetime revenue from the referred client is tracked whatever happens, so
  // "which customers bring the best customers" stays answerable.
  await prisma.referral.update({
    where: { id: referral.id },
    data: { attributedRevenueFils: await lifetimeRevenueFils(job.clientId) },
  });

  // A job settled from a prepaid package counts as paid — the money arrived
  // when the package was bought.
  const paid = Boolean(
    job.packageUsage ??
      (job.invoice && (job.invoice.status === "PAID" || job.invoice.balanceFils <= 0)),
  );

  const check = referralQualifies({
    status: referral.status,
    jobCompleted: job.status === "COMPLETED",
    jobPaid: paid,
    referrerClientId: referral.referrerClientId,
    refereeClientId: referral.refereeClientId,
  });

  if (!check.qualifies) return { kind: "NOT_YET", reason: check.reason };

  return rewardReferral(referral.id, job.id, job.totalFils);
}

/**
 * Pays out one referral: credit for the person who recommended you, credit for
 * the person who came. Both land on their account and come off their next
 * invoice automatically.
 */
export async function rewardReferral(
  referralId: string,
  qualifyingJobId: string | null,
  qualifyingJobValueFils: number,
): Promise<ReferralOutcome> {
  const org = await prisma.organization.findFirst();
  if (!org) return { kind: "NOT_YET", reason: "NO_SETTINGS" };

  const rewards = referralRewardFils({
    discountType: org.referralDiscountType as DiscountType,
    referrerRewardValue: org.referrerRewardValue,
    refereeRewardValue: org.refereeRewardValue,
    qualifyingJobValueFils,
  });

  const referral = await prisma.$transaction(async (tx) => {
    const current = await tx.referral.findUnique({
      where: { id: referralId },
      select: {
        id: true, code: true, status: true, referrerClientId: true, refereeClientId: true,
        referrerClient: { select: { contactName: true, companyName: true } },
      },
    });
    // Re-checked inside the transaction, so two simultaneous completions cannot
    // both pay out the same referral.
    if (!current || current.status === "REWARDED" || current.status === "CANCELLED") return null;

    if (rewards.referrerFils > 0) {
      await tx.client.update({
        where: { id: current.referrerClientId },
        data: { creditBalanceFils: { increment: rewards.referrerFils } },
      });
    }
    if (rewards.refereeFils > 0 && current.refereeClientId) {
      await tx.client.update({
        where: { id: current.refereeClientId },
        data: { creditBalanceFils: { increment: rewards.refereeFils } },
      });
    }

    const now = new Date();
    return tx.referral.update({
      where: { id: referralId },
      data: {
        status: "REWARDED",
        qualifyingJobId,
        referrerRewardFils: rewards.referrerFils,
        refereeDiscountFils: rewards.refereeFils,
        referrerRewardedAt: rewards.referrerFils > 0 ? now : null,
        refereeDiscountedAt: rewards.refereeFils > 0 ? now : null,
      },
      select: { id: true, code: true, referrerClientId: true },
    });
  });

  if (!referral) return { kind: "NOT_YET", reason: "ALREADY_QUALIFIED" };

  await recordAudit({
    action: "UPDATE",
    entity: "Referral",
    entityId: referral.id,
    summary:
      `Referral ${referral.code} paid out: ${formatMoney(rewards.referrerFils)} to the referrer, ` +
      `${formatMoney(rewards.refereeFils)} to the new client`,
  });

  return {
    kind: "REWARDED",
    referralId: referral.id,
    referrerFils: rewards.referrerFils,
    refereeFils: rewards.refereeFils,
  };
}

/** Everything this client has ever been invoiced, excluding voided invoices. */
async function lifetimeRevenueFils(clientId: string, tx?: Prisma.TransactionClient): Promise<number> {
  const db = tx ?? prisma;
  const total = await db.invoice.aggregate({
    where: { clientId, deletedAt: null, status: { not: "VOID" } },
    _sum: { totalFils: true },
  });
  return total._sum?.totalFils ?? 0;
}

export type ReferralSweepResult = {
  checked: number;
  rewarded: number;
  totalPaidFils: number;
};

/**
 * Catches up on any referral that qualified while nobody was looking — a job
 * completed before this feature existed, or an invoice paid days later.
 *
 * Reward is triggered by job completion; this is the safety net for the far
 * more common case of the invoice being settled afterwards.
 */
export async function sweepPendingReferrals(): Promise<ReferralSweepResult> {
  const pending = await prisma.referral.findMany({
    where: { status: { in: ["PENDING", "QUALIFIED"] }, refereeClientId: { not: null } },
    take: 200,
    select: { id: true, refereeClientId: true },
  });

  const result: ReferralSweepResult = { checked: 0, rewarded: 0, totalPaidFils: 0 };

  for (const referral of pending) {
    if (!referral.refereeClientId) continue;

    // Their first completed job that has actually been paid for.
    const job = await prisma.job.findFirst({
      where: {
        clientId: referral.refereeClientId,
        deletedAt: null,
        status: "COMPLETED",
        OR: [
          { packageUsage: { isNot: null } },
          { invoice: { status: "PAID" } },
        ],
      },
      orderBy: { scheduledStart: "asc" },
      select: { id: true, totalFils: true },
    });

    result.checked += 1;
    if (!job) continue;

    const outcome = await rewardReferral(referral.id, job.id, job.totalFils);
    if (outcome.kind === "REWARDED") {
      result.rewarded += 1;
      result.totalPaidFils += outcome.referrerFils + outcome.refereeFils;
    }
  }

  return result;
}
