/**
 * The rules that decide who is about to leave, and what to do about it.
 *
 * PLAIN ENGLISH: how a rating turns into a complaint ticket, how a Net
 * Promoter Score is worked out, which clients look like they are drifting
 * away, and what a referral is worth to both sides. Pure arithmetic with no
 * database and no clock of its own, so every rule can be tested directly.
 *
 * Every amount is a whole number of fils. Every rate is in basis points.
 */

/* --------------------------------- ratings -------------------------------- */

export type RatingOutcome = {
  /** Below the company's threshold, so somebody has to look at it. */
  opensTicket: boolean;
  /** Top marks, so it is worth asking for a public review. */
  askForGoogleReview: boolean;
  /** How urgently a complaint needs answering. */
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

/**
 * What happens after a client rates a job.
 *
 * One star is treated as CRITICAL rather than merely bad: in this business a
 * one-star clean usually means nobody turned up, or something was damaged.
 */
export function ratingOutcome(stars: number, reCleanThreshold: number): RatingOutcome {
  const opensTicket = stars < reCleanThreshold;
  return {
    opensTicket,
    askForGoogleReview: stars === 5,
    severity: stars <= 1 ? "CRITICAL" : stars === 2 ? "HIGH" : opensTicket ? "MEDIUM" : "LOW",
  };
}

/** When the "how did we do?" message should go out, after a job finishes. */
export function ratingRequestDueAt(jobEnd: Date, delayMinutes: number): Date {
  return new Date(jobEnd.getTime() + Math.max(0, delayMinutes) * 60_000);
}

/**
 * The average of the stars given, to one decimal place.
 *
 * Returns null rather than 0 when nobody has rated yet, because "no ratings"
 * and "everyone rated zero" are very different things to show an owner.
 */
export function averageStars(ratings: { stars: number }[]): number | null {
  if (ratings.length === 0) return null;
  const total = ratings.reduce((sum, r) => sum + r.stars, 0);
  return Math.round((total / ratings.length) * 10) / 10;
}

/* ----------------------------------- NPS ---------------------------------- */

export type NpsBucket = "PROMOTER" | "PASSIVE" | "DETRACTOR";

/** The standard Net Promoter Score bands: 9–10 promote, 7–8 shrug, 0–6 harm. */
export function npsBucket(score: number): NpsBucket {
  if (score >= 9) return "PROMOTER";
  if (score >= 7) return "PASSIVE";
  return "DETRACTOR";
}

export type NpsSummary = {
  responses: number;
  promoters: number;
  passives: number;
  detractors: number;
  /** −100 to +100. Null when nobody has answered — not zero. */
  score: number | null;
};

/**
 * NPS = % promoters − % detractors. Passives count towards the total but
 * neither add nor subtract, which is what makes the number move so sharply.
 */
export function npsSummary(responses: { score: number | null }[]): NpsSummary {
  const answered = responses.filter((r): r is { score: number } => typeof r.score === "number");
  const promoters = answered.filter((r) => npsBucket(r.score) === "PROMOTER").length;
  const passives = answered.filter((r) => npsBucket(r.score) === "PASSIVE").length;
  const detractors = answered.filter((r) => npsBucket(r.score) === "DETRACTOR").length;

  return {
    responses: answered.length,
    promoters,
    passives,
    detractors,
    score: answered.length === 0
      ? null
      : Math.round(((promoters - detractors) / answered.length) * 100),
  };
}

/** The calendar quarter a date falls in, as "2026-Q3". */
export function quarterOf(date: Date): string {
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

/**
 * Is this client due their next NPS survey?
 *
 * Once per quarter at most, and never twice in the same quarter even if the
 * interval has technically elapsed.
 */
export function npsDue(input: {
  lastSentAt: Date | null;
  intervalDays: number;
  now: Date;
  quartersAlreadySent: string[];
}): boolean {
  if (input.quartersAlreadySent.includes(quarterOf(input.now))) return false;
  if (!input.lastSentAt) return true;
  const days = (input.now.getTime() - input.lastSentAt.getTime()) / 86_400_000;
  return days >= input.intervalDays;
}

/* ------------------------------- churn risk ------------------------------- */

export type RiskReason =
  | "SKIPPED_CYCLES"
  | "RATING_DECLINE"
  | "PAYMENT_FRICTION"
  | "INACTIVITY"
  | "COMPLAINT_HISTORY";

export type RiskFlag = {
  reason: RiskReason;
  detail: string;
  /** 0–100. Higher means act sooner. */
  score: number;
  suggestedAction: string;
};

export type RiskInput = {
  /** Days since their last completed job. Null if they have never had one. */
  daysSinceLastJob: number | null;
  /** Consecutive expected recurring visits that did not happen. */
  skippedCycles: number;
  /** Average stars over their most recent jobs, and over the ones before. */
  recentAverageStars: number | null;
  earlierAverageStars: number | null;
  /** Invoices past due right now, and the worst days-overdue among them. */
  overdueInvoices: number;
  worstDaysOverdue: number;
  /** Complaint tickets raised in the last 90 days. */
  recentComplaints: number;
  /** How they book — a one-off customer going quiet is not the same signal. */
  isRecurring: boolean;
};

export type RiskThresholds = {
  /** From the company settings: how many missed visits count as churn. */
  churnSkippedCycles: number;
  /** From the company settings: days of silence before a win-back offer. */
  winbackInactiveDays: number;
};

/**
 * Every reason this client looks like they are leaving, worst first.
 *
 * A client can trip several of these at once — someone who skipped two cleans
 * AND has an unpaid invoice is a different conversation from someone who just
 * went quiet. Returning all of them lets the screen say which.
 */
export function assessRisk(input: RiskInput, thresholds: RiskThresholds): RiskFlag[] {
  const flags: RiskFlag[] = [];

  if (input.isRecurring && input.skippedCycles >= thresholds.churnSkippedCycles) {
    flags.push({
      reason: "SKIPPED_CYCLES",
      detail: `Skipped ${input.skippedCycles} scheduled cleans in a row.`,
      // Two skips is already serious; each further skip adds urgency.
      score: Math.min(100, 60 + (input.skippedCycles - thresholds.churnSkippedCycles) * 15),
      suggestedAction: "Call them. Ask whether the day or the team needs changing before offering a discount.",
    });
  }

  if (
    input.recentAverageStars !== null &&
    input.earlierAverageStars !== null &&
    input.earlierAverageStars - input.recentAverageStars >= 1
  ) {
    const drop = Math.round((input.earlierAverageStars - input.recentAverageStars) * 10) / 10;
    flags.push({
      reason: "RATING_DECLINE",
      detail: `Ratings fell from ${input.earlierAverageStars} to ${input.recentAverageStars} stars.`,
      score: Math.min(100, 50 + Math.round(drop * 20)),
      suggestedAction: "Read their recent comments, then offer a re-clean with a different team lead.",
    });
  }

  if (input.overdueInvoices > 0 && input.worstDaysOverdue >= 14) {
    flags.push({
      reason: "PAYMENT_FRICTION",
      detail: `${input.overdueInvoices} invoice(s) overdue, the oldest by ${input.worstDaysOverdue} days.`,
      score: Math.min(100, 40 + Math.round(input.worstDaysOverdue / 2)),
      suggestedAction: "Ring them about the invoice before booking more work — unpaid clients usually stop booking anyway.",
    });
  }

  if (
    input.daysSinceLastJob !== null &&
    input.daysSinceLastJob >= thresholds.winbackInactiveDays
  ) {
    flags.push({
      reason: "INACTIVITY",
      detail: `No completed job for ${input.daysSinceLastJob} days.`,
      score: Math.min(100, 30 + Math.round(input.daysSinceLastJob / 4)),
      suggestedAction: "Include them in the next win-back campaign.",
    });
  }

  if (input.recentComplaints >= 2) {
    flags.push({
      reason: "COMPLAINT_HISTORY",
      detail: `${input.recentComplaints} complaints in the last 90 days.`,
      score: Math.min(100, 45 + input.recentComplaints * 10),
      suggestedAction: "The owner should call personally. Repeat complaints rarely fix themselves.",
    });
  }

  return flags.sort((a, b) => b.score - a.score);
}

/** The single number the retention list sorts on: the worst flag they have. */
export function worstRiskScore(flags: { score: number }[]): number {
  return flags.reduce((worst, f) => Math.max(worst, f.score), 0);
}

/* -------------------------------- win-back -------------------------------- */

export type WinbackCheck =
  | { eligible: true }
  | { eligible: false; reason: "TOO_RECENT" | "NEVER_BOOKED" | "ALREADY_CONTACTED" | "PAUSED" | "NO_CONTACT" };

/**
 * Should this client get a win-back offer?
 *
 * Deliberately conservative. Messaging somebody who is paused for non-payment,
 * or who was contacted a fortnight ago, costs goodwill rather than earning it.
 */
export function winbackEligible(input: {
  daysSinceLastJob: number | null;
  inactiveDays: number;
  daysSinceLastCampaign: number | null;
  isBookingPaused: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  /** Don't pester the same person more often than this. */
  minDaysBetweenCampaigns?: number;
}): WinbackCheck {
  const gap = input.minDaysBetweenCampaigns ?? 30;

  if (input.daysSinceLastJob === null) return { eligible: false, reason: "NEVER_BOOKED" };
  if (input.isBookingPaused) return { eligible: false, reason: "PAUSED" };
  if (!input.hasEmail && !input.hasPhone) return { eligible: false, reason: "NO_CONTACT" };
  if (input.daysSinceLastJob < input.inactiveDays) return { eligible: false, reason: "TOO_RECENT" };
  if (input.daysSinceLastCampaign !== null && input.daysSinceLastCampaign < gap) {
    return { eligible: false, reason: "ALREADY_CONTACTED" };
  }
  return { eligible: true };
}

/* -------------------------------- referrals ------------------------------- */

export type DiscountType = "FIXED" | "PERCENTAGE";

/**
 * What each side of a referral actually gets, in fils.
 *
 * A percentage reward is a percentage of the qualifying job, so a referral
 * that brings in a big deep clean is worth more than one that brings a
 * single regular visit. A fixed reward ignores the job value entirely.
 */
export function referralRewardFils(input: {
  discountType: DiscountType;
  referrerRewardValue: number;
  refereeRewardValue: number;
  qualifyingJobValueFils: number;
}): { referrerFils: number; refereeFils: number } {
  if (input.discountType === "PERCENTAGE") {
    return {
      referrerFils: Math.round((input.qualifyingJobValueFils * input.referrerRewardValue) / 10_000),
      refereeFils: Math.round((input.qualifyingJobValueFils * input.refereeRewardValue) / 10_000),
    };
  }
  return {
    referrerFils: Math.max(0, Math.round(input.referrerRewardValue)),
    refereeFils: Math.max(0, Math.round(input.refereeRewardValue)),
  };
}

export type ReferralCheck =
  | { qualifies: true }
  | { qualifies: false; reason: "NOT_COMPLETED" | "NOT_PAID" | "ALREADY_QUALIFIED" | "CANCELLED" | "SELF_REFERRAL" };

/**
 * Has a referral earned its reward yet?
 *
 * The bar is deliberately "completed AND paid". Rewarding on booking alone
 * invites people to refer themselves, book, and cancel.
 */
export function referralQualifies(input: {
  status: string;
  jobCompleted: boolean;
  jobPaid: boolean;
  referrerClientId: string;
  refereeClientId: string | null;
}): ReferralCheck {
  if (input.status === "CANCELLED") return { qualifies: false, reason: "CANCELLED" };
  if (input.status === "QUALIFIED" || input.status === "REWARDED") {
    return { qualifies: false, reason: "ALREADY_QUALIFIED" };
  }
  if (input.refereeClientId && input.refereeClientId === input.referrerClientId) {
    return { qualifies: false, reason: "SELF_REFERRAL" };
  }
  if (!input.jobCompleted) return { qualifies: false, reason: "NOT_COMPLETED" };
  if (!input.jobPaid) return { qualifies: false, reason: "NOT_PAID" };
  return { qualifies: true };
}
