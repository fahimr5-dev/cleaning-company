import "server-only";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { assessRisk, averageStars, type RiskFlag } from "@/lib/retention";

/**
 * Working out which clients are quietly on their way out.
 *
 * PLAIN ENGLISH: nobody phones up to say "I am leaving you". They just stop
 * booking. This reads the signals that come before that — missed cleans,
 * ratings sliding, an invoice they have stopped paying, complaints piling up —
 * and puts a name in front of you while there is still something to do.
 *
 * The rules themselves live in src/lib/retention.ts with their tests. This file
 * only gathers the facts to feed them.
 */

const DAY_MS = 86_400_000;

/** Complaint-shaped tickets. A missing key is not a sign the client is leaving. */
const COMPLAINT_TYPES = ["CLIENT_COMPLAINT", "ON_SITE_COMPLAINT", "LOW_RATING", "DAMAGE"] as const;

export type DetectionResult = {
  clientsChecked: number;
  flagsOpened: number;
  flagsRefreshed: number;
  flagsClosed: number;
};

/**
 * Re-reads every active client and brings their risk flags up to date.
 *
 * Idempotent by design: a problem that is still true keeps its existing flag
 * (with the detail and score refreshed), and a problem that has gone away has
 * its flag closed as ACTIONED rather than left to rot.
 */
export async function detectChurnRisk(options: { now?: Date } = {}): Promise<DetectionResult> {
  const now = options.now ?? new Date();
  const result: DetectionResult = {
    clientsChecked: 0, flagsOpened: 0, flagsRefreshed: 0, flagsClosed: 0,
  };

  const org = await prisma.organization.findFirst();
  if (!org) return result;

  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);

  const clients = await prisma.client.findMany({
    where: { deletedAt: null, status: { in: ["ACTIVE", "PAUSED"] } },
    select: {
      id: true, contactName: true, companyName: true, lastJobAt: true,
      series: { where: { status: "ACTIVE" }, select: { id: true } },
      riskFlags: { where: { status: "OPEN" }, select: { id: true, reason: true } },
      jobs: {
        where: { deletedAt: null, scheduledStart: { lte: now } },
        orderBy: { scheduledStart: "desc" },
        take: 12,
        select: { id: true, status: true, scheduledStart: true },
      },
      ratings: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        take: 6,
        select: { stars: true },
      },
      invoices: {
        where: {
          deletedAt: null,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
          balanceFils: { gt: 0 },
          dueDate: { lt: now },
        },
        select: { dueDate: true },
      },
      tickets: {
        where: {
          deletedAt: null,
          createdAt: { gte: ninetyDaysAgo },
          type: { in: [...COMPLAINT_TYPES] },
        },
        select: { id: true },
      },
    },
  });

  for (const client of clients) {
    result.clientsChecked += 1;

    const completed = client.jobs.filter((j) => j.status === "COMPLETED");
    const lastCompleted = completed[0]?.scheduledStart ?? client.lastJobAt ?? null;

    // A "skipped cycle" is a scheduled visit that ended in a cancellation or a
    // locked door. Counted consecutively from the most recent job backwards,
    // because two skips six months apart is not the same as two in a row.
    let skippedCycles = 0;
    for (const job of client.jobs) {
      if (job.status === "CANCELLED" || job.status === "NO_ACCESS") skippedCycles += 1;
      else if (job.status === "COMPLETED") break;
    }

    // Ratings: the three most recent against the three before them.
    const recent = client.ratings.slice(0, 3);
    const earlier = client.ratings.slice(3, 6);

    const worstDaysOverdue = client.invoices.reduce((worst, invoice) => {
      const days = Math.floor((now.getTime() - invoice.dueDate.getTime()) / DAY_MS);
      return Math.max(worst, days);
    }, 0);

    const flags = assessRisk(
      {
        daysSinceLastJob: lastCompleted
          ? Math.floor((now.getTime() - lastCompleted.getTime()) / DAY_MS)
          : null,
        skippedCycles,
        recentAverageStars: recent.length >= 2 ? averageStars(recent) : null,
        earlierAverageStars: earlier.length >= 2 ? averageStars(earlier) : null,
        overdueInvoices: client.invoices.length,
        worstDaysOverdue,
        recentComplaints: client.tickets.length,
        isRecurring: client.series.length > 0,
      },
      {
        churnSkippedCycles: org.churnSkippedCycles,
        winbackInactiveDays: org.winbackInactiveDays,
      },
    );

    const stillTrue = new Set(flags.map((f) => f.reason));

    for (const flag of flags) {
      const existing = client.riskFlags.find((f) => f.reason === flag.reason);
      if (existing) {
        await prisma.clientRiskFlag.update({
          where: { id: existing.id },
          data: { detail: flag.detail, score: flag.score, suggestedAction: flag.suggestedAction },
        });
        result.flagsRefreshed += 1;
      } else {
        await prisma.clientRiskFlag.create({
          data: {
            clientId: client.id,
            reason: flag.reason,
            detail: flag.detail,
            score: flag.score,
            suggestedAction: flag.suggestedAction,
          },
        });
        result.flagsOpened += 1;
      }
    }

    // A problem that has resolved itself closes its own flag — otherwise the
    // list fills with warnings about clients who came back weeks ago.
    const resolved = client.riskFlags.filter((f) => !stillTrue.has(f.reason as RiskFlag["reason"]));
    if (resolved.length > 0) {
      await prisma.clientRiskFlag.updateMany({
        where: { id: { in: resolved.map((f) => f.id) } },
        data: {
          status: "ACTIONED",
          resolvedAt: now,
          resolutionNote: "No longer true when the risk list was last rebuilt.",
        },
      });
      result.flagsClosed += resolved.length;
    }
  }

  if (result.flagsOpened > 0 || result.flagsClosed > 0) {
    await recordAudit({
      action: "UPDATE",
      entity: "ClientRiskFlag",
      // A sweep across every client, not one row — the summary is the record.
      entityId: "sweep",
      summary:
        `Churn risk rebuilt: ${result.flagsOpened} new warnings, ` +
        `${result.flagsClosed} cleared, across ${result.clientsChecked} clients`,
    });
  }

  return result;
}
