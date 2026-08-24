/**
 * The rules that keep your people legal, paid and rested.
 *
 * PLAIN ENGLISH: in the UAE an employee whose visa or Emirates ID has expired
 * must not be sent to a job — the fine lands on you, not on them. These rules
 * decide when to warn you, when to stop a booking, how much leave somebody has
 * left, and which hours count towards pay.
 *
 * Pure arithmetic with no database and no clock of its own, so every rule can
 * be tested directly. Money is always whole fils.
 */

const DAY_MS = 86_400_000;

/* ------------------------------ documents -------------------------------- */

export type DocumentStatus = "VALID" | "EXPIRING" | "EXPIRED" | "MISSING";

export type DocumentCheck = {
  status: DocumentStatus;
  /** Negative once it has already expired. Null when there is no date at all. */
  daysUntilExpiry: number | null;
  /** True when this alone should stop the person being scheduled. */
  blocksWork: boolean;
};

/**
 * Which documents legally stop somebody working once they lapse.
 *
 * A training certificate expiring is a problem for quality. A visa expiring is
 * a problem for the labour inspector, and it is a different kind of problem.
 */
export const WORK_BLOCKING_DOCUMENTS = ["VISA", "EMIRATES_ID", "LABOUR_CARD"] as const;

export type BlockingDocumentType = (typeof WORK_BLOCKING_DOCUMENTS)[number];

/**
 * The state of one document on a given day.
 *
 * `warnWithinDays` is the widest of your alert offsets — with the default
 * [60, 30, 7] a document is "expiring" from 60 days out.
 */
export function documentStatus(input: {
  type: string;
  expiresAt: Date | null;
  now: Date;
  warnWithinDays?: number;
}): DocumentCheck {
  const blocking = (WORK_BLOCKING_DOCUMENTS as readonly string[]).includes(input.type);

  if (!input.expiresAt) {
    // No expiry recorded. For a passport or a contract that is normal; for a
    // visa it means somebody has not finished filling the record in.
    return {
      status: blocking ? "MISSING" : "VALID",
      daysUntilExpiry: null,
      blocksWork: false,
    };
  }

  const days = Math.floor((startOfDay(input.expiresAt).getTime() - startOfDay(input.now).getTime()) / DAY_MS);
  const warnWithin = input.warnWithinDays ?? 60;

  if (days < 0) return { status: "EXPIRED", daysUntilExpiry: days, blocksWork: blocking };
  if (days <= warnWithin) return { status: "EXPIRING", daysUntilExpiry: days, blocksWork: false };
  return { status: "VALID", daysUntilExpiry: days, blocksWork: false };
}

/** Midnight, so "expires today" is not "expired" because of the time of day. */
export function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

/**
 * Which alert is due for a document today, if any.
 *
 * Returns the LARGEST offset that has been reached and not yet sent, so a
 * document first entered when it is already 20 days from expiry sends the
 * 30-day warning once rather than firing 60, 30 and 7 all at once.
 */
export function dueComplianceAlert(input: {
  daysUntilExpiry: number | null;
  offsetsDays: number[];
  alreadySent: number[];
}): number | null {
  if (input.daysUntilExpiry === null) return null;

  const candidates = input.offsetsDays
    .filter((offset) => input.daysUntilExpiry! <= offset)
    .filter((offset) => !input.alreadySent.includes(offset))
    .sort((a, b) => b - a);

  return candidates[0] ?? null;
}

export type StaffComplianceSummary = {
  /** Worst state across all their documents. */
  status: DocumentStatus;
  blockedFromWork: boolean;
  expiredCount: number;
  expiringCount: number;
  missingCount: number;
  /** The soonest expiry still ahead, for sorting a list by urgency. */
  soonestDays: number | null;
};

/** One person's overall document position, worst-first. */
export function staffCompliance(documents: DocumentCheck[]): StaffComplianceSummary {
  const expired = documents.filter((d) => d.status === "EXPIRED");
  const expiring = documents.filter((d) => d.status === "EXPIRING");
  const missing = documents.filter((d) => d.status === "MISSING");

  const ahead = documents
    .map((d) => d.daysUntilExpiry)
    .filter((d): d is number => d !== null && d >= 0);

  return {
    status: expired.length > 0
      ? "EXPIRED"
      : missing.length > 0
        ? "MISSING"
        : expiring.length > 0
          ? "EXPIRING"
          : "VALID",
    blockedFromWork: documents.some((d) => d.blocksWork),
    expiredCount: expired.length,
    expiringCount: expiring.length,
    missingCount: missing.length,
    soonestDays: ahead.length > 0 ? Math.min(...ahead) : null,
  };
}

/* -------------------------------- leave ---------------------------------- */

export type LeaveBalance = {
  entitlementDays: number;
  takenDays: number;
  bookedDays: number;
  remainingDays: number;
};

/**
 * How much annual leave somebody has left.
 *
 * Only ANNUAL leave comes off the entitlement. Sick, emergency, maternity and
 * Hajj leave are separate entitlements under UAE law and are not deducted here.
 */
export function leaveBalance(input: {
  entitlementDays: number;
  requests: Array<{ type: string; days: number; status: string }>;
}): LeaveBalance {
  const annual = input.requests.filter((r) => r.type === "ANNUAL");
  const takenDays = annual
    .filter((r) => r.status === "APPROVED")
    .reduce((total, r) => total + r.days, 0);
  const bookedDays = annual
    .filter((r) => r.status === "PENDING")
    .reduce((total, r) => total + r.days, 0);

  return {
    entitlementDays: input.entitlementDays,
    takenDays,
    bookedDays,
    remainingDays: input.entitlementDays - takenDays - bookedDays,
  };
}

/** Whole days a leave request covers, counting both end days. */
export function leaveDays(startDate: Date, endDate: Date): number {
  const days = Math.floor(
    (startOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / DAY_MS,
  ) + 1;
  return Math.max(0, days);
}

export type LeaveCheck =
  | { allowed: true; warnings: LeaveWarning[] }
  | { allowed: false; reason: "BACKWARDS_DATES" | "OVERLAPS_EXISTING" | "NOT_EMPLOYED"; warnings: LeaveWarning[] };

export type LeaveWarning =
  | { kind: "EXCEEDS_BALANCE"; remainingDays: number; requestedDays: number }
  | { kind: "JOBS_SCHEDULED"; jobCount: number }
  | { kind: "TEAM_LEFT_SHORT"; date: string; remainingCleaners: number };

/**
 * Can this leave be booked?
 *
 * Overlapping the same person's existing leave is refused outright — that is
 * always a mistake. Everything else is a WARNING, because the owner knows
 * things the app does not: they may be happy to grant unpaid leave over the
 * balance, or to move the jobs.
 */
export function checkLeaveRequest(input: {
  startDate: Date;
  endDate: Date;
  type: string;
  isEmployed: boolean;
  balance: LeaveBalance;
  overlapsExisting: boolean;
  jobsInPeriod: number;
  coverageShortfalls: Array<{ date: string; remainingCleaners: number }>;
}): LeaveCheck {
  const warnings: LeaveWarning[] = [];
  const days = leaveDays(input.startDate, input.endDate);

  if (input.type === "ANNUAL" && days > input.balance.remainingDays) {
    warnings.push({
      kind: "EXCEEDS_BALANCE",
      remainingDays: input.balance.remainingDays,
      requestedDays: days,
    });
  }
  if (input.jobsInPeriod > 0) {
    warnings.push({ kind: "JOBS_SCHEDULED", jobCount: input.jobsInPeriod });
  }
  for (const shortfall of input.coverageShortfalls) {
    warnings.push({
      kind: "TEAM_LEFT_SHORT",
      date: shortfall.date,
      remainingCleaners: shortfall.remainingCleaners,
    });
  }

  if (!input.isEmployed) return { allowed: false, reason: "NOT_EMPLOYED", warnings };
  if (startOfDay(input.endDate) < startOfDay(input.startDate)) {
    return { allowed: false, reason: "BACKWARDS_DATES", warnings };
  }
  if (input.overlapsExisting) return { allowed: false, reason: "OVERLAPS_EXISTING", warnings };

  return { allowed: true, warnings };
}

/* ------------------------------ timesheets -------------------------------- */

export type TimesheetLine = {
  minutesWorked: number;
  reviewStatus: string;
  flagged: boolean;
};

export type PayrollHours = {
  approvedMinutes: number;
  pendingMinutes: number;
  rejectedMinutes: number;
  /** Only approved time is payable — that is the point of the review step. */
  payableHours: number;
  entriesAwaitingReview: number;
};

/**
 * Adds up a period's timesheet.
 *
 * Time clocked outside the geofence is flagged for a manager to look at. Until
 * they do, it is NOT counted as payable — otherwise the review step would be
 * decoration.
 */
export function payrollHours(lines: TimesheetLine[]): PayrollHours {
  const sum = (filter: (l: TimesheetLine) => boolean) =>
    lines.filter(filter).reduce((total, l) => total + Math.max(0, l.minutesWorked), 0);

  const approvedMinutes = sum((l) => l.reviewStatus === "APPROVED" || l.reviewStatus === "NOT_REQUIRED");
  const pendingMinutes = sum((l) => l.reviewStatus === "PENDING");
  const rejectedMinutes = sum((l) => l.reviewStatus === "REJECTED");

  return {
    approvedMinutes,
    pendingMinutes,
    rejectedMinutes,
    payableHours: Math.round((approvedMinutes / 60) * 100) / 100,
    entriesAwaitingReview: lines.filter((l) => l.reviewStatus === "PENDING").length,
  };
}

/* -------------------------------- payroll --------------------------------- */

export type WpsLine = {
  employeeNo: string;
  fullName: string;
  iban: string | null;
  labourCardNo: string | null;
  basicSalaryFils: number;
  allowancesFils: number;
  deductionsFils: number;
  totalFils: number;
  /** Why this line cannot be paid yet, if it cannot. */
  problem: string | null;
};

/**
 * One month's pay line per employee, ready to export for the bank's WPS file.
 *
 * CleanOS does NOT process salaries — it produces the figures you hand to your
 * bank. Anyone missing an IBAN or a labour card number is still listed, with
 * the reason, rather than silently dropped from the file.
 */
export function wpsLine(input: {
  employeeNo: string;
  fullName: string;
  iban: string | null;
  labourCardNo: string | null;
  basicSalaryFils: number;
  allowancesFils: number;
  unpaidLeaveDays: number;
  daysInMonth: number;
}): WpsLine {
  const gross = input.basicSalaryFils + input.allowancesFils;

  // Unpaid leave is deducted at the daily rate of the whole package.
  const dailyFils = input.daysInMonth > 0 ? Math.round(gross / input.daysInMonth) : 0;
  const deductionsFils = Math.min(gross, dailyFils * Math.max(0, input.unpaidLeaveDays));

  const missing: string[] = [];
  if (!input.iban) missing.push("IBAN");
  if (!input.labourCardNo) missing.push("labour card number");
  if (gross === 0) missing.push("salary");

  return {
    employeeNo: input.employeeNo,
    fullName: input.fullName,
    iban: input.iban,
    labourCardNo: input.labourCardNo,
    basicSalaryFils: input.basicSalaryFils,
    allowancesFils: input.allowancesFils,
    deductionsFils,
    totalFils: gross - deductionsFils,
    problem: missing.length > 0 ? `Missing ${missing.join(" and ")}.` : null,
  };
}
