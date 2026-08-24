/**
 * The rules that decide what a client owes.
 *
 * PLAIN ENGLISH: every figure on an invoice, how a payment is applied to it,
 * whether it is overdue, and how old the debt is. Pure arithmetic with no
 * database and no clock of its own, so every rule can be tested directly.
 *
 * Every amount is a whole number of fils. Every rate is in basis points.
 */

import { vatOn } from "./money";

/* ------------------------------- invoice maths ---------------------------- */

export type InvoiceLineInput = {
  /** Number of units. Kept separate from the price so "3 × AED 90" reads right. */
  quantity: number;
  unitPriceFils: number;
  /** A discount on this line only, in fils. */
  discountFils?: number;
  /** Basis points. 500 = 5%. Zero-rated and exempt supplies use 0. */
  vatRateBps: number;
};

export type InvoiceLineTotals = {
  /** quantity × unit price, before any discount. */
  grossFils: number;
  discountFils: number;
  /** What VAT is charged on. */
  netFils: number;
  vatFils: number;
  totalFils: number;
};

/**
 * Totals for one line.
 *
 * VAT is worked out per line, not on the invoice total, because a single
 * invoice can mix a 5% supply with a zero-rated one — and the FTA expects the
 * tax shown against each.
 */
export function lineTotals(line: InvoiceLineInput): InvoiceLineTotals {
  const grossFils = Math.round(line.quantity * line.unitPriceFils);
  const discountFils = Math.min(Math.max(0, line.discountFils ?? 0), grossFils);
  const netFils = grossFils - discountFils;
  const vatFils = vatOn(netFils, line.vatRateBps);

  return { grossFils, discountFils, netFils, vatFils, totalFils: netFils + vatFils };
}

export type InvoiceTotals = {
  subtotalFils: number;
  discountFils: number;
  netFils: number;
  vatFils: number;
  totalFils: number;
  /** VAT split by rate, which a VAT return needs. */
  vatByRate: { rateBps: number; netFils: number; vatFils: number }[];
};

export function invoiceTotals(lines: InvoiceLineInput[]): InvoiceTotals {
  const totals = lines.map(lineTotals);

  const byRate = new Map<number, { netFils: number; vatFils: number }>();
  lines.forEach((line, i) => {
    const current = byRate.get(line.vatRateBps) ?? { netFils: 0, vatFils: 0 };
    byRate.set(line.vatRateBps, {
      netFils: current.netFils + totals[i].netFils,
      vatFils: current.vatFils + totals[i].vatFils,
    });
  });

  const sum = (pick: (t: InvoiceLineTotals) => number) =>
    totals.reduce((total, t) => total + pick(t), 0);

  return {
    subtotalFils: sum((t) => t.grossFils),
    discountFils: sum((t) => t.discountFils),
    netFils: sum((t) => t.netFils),
    vatFils: sum((t) => t.vatFils),
    totalFils: sum((t) => t.totalFils),
    vatByRate: [...byRate.entries()]
      .map(([rateBps, v]) => ({ rateBps, ...v }))
      .sort((a, b) => b.rateBps - a.rateBps),
  };
}

/* ------------------------------ what is owed ------------------------------ */

export type InvoiceStatus =
  | "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";

export type SettlementInput = {
  totalFils: number;
  /** Money received against this invoice. */
  paidFils: number;
  /** Credit notes applied to this invoice. */
  creditedFils: number;
  dueDate: Date;
  now: Date;
  isVoid?: boolean;
  isDraft?: boolean;
};

export type Settlement = {
  status: InvoiceStatus;
  balanceFils: number;
  settledFils: number;
  isOverdue: boolean;
  daysOverdue: number;
};

/**
 * Works out where an invoice stands.
 *
 * A credit note counts towards settling the invoice just as a payment does —
 * an invoice fully covered by a credit note is settled, not still owing.
 */
export function settleInvoice(input: SettlementInput): Settlement {
  const settledFils = Math.max(0, input.paidFils) + Math.max(0, input.creditedFils);
  const balanceFils = Math.max(0, input.totalFils - settledFils);

  const dayMs = 86_400_000;
  const dueMidnight = new Date(input.dueDate);
  dueMidnight.setHours(23, 59, 59, 999);
  const daysOverdue =
    balanceFils > 0 && input.now > dueMidnight
      ? Math.floor((input.now.getTime() - dueMidnight.getTime()) / dayMs) + 1
      : 0;

  if (input.isVoid) {
    return { status: "VOID", balanceFils: 0, settledFils, isOverdue: false, daysOverdue: 0 };
  }
  if (input.isDraft) {
    return { status: "DRAFT", balanceFils, settledFils, isOverdue: false, daysOverdue: 0 };
  }
  if (balanceFils === 0) {
    return { status: "PAID", balanceFils: 0, settledFils, isOverdue: false, daysOverdue: 0 };
  }
  if (daysOverdue > 0) {
    return { status: "OVERDUE", balanceFils, settledFils, isOverdue: true, daysOverdue };
  }
  if (settledFils > 0) {
    return { status: "PARTIALLY_PAID", balanceFils, settledFils, isOverdue: false, daysOverdue: 0 };
  }
  return { status: "ISSUED", balanceFils, settledFils, isOverdue: false, daysOverdue: 0 };
}

/* --------------------------- allocating a payment ------------------------- */

export type OpenInvoice = {
  id: string;
  invoiceNo: string;
  balanceFils: number;
  dueDate: Date;
};

export type Allocation = {
  invoiceId: string;
  invoiceNo: string;
  amountFils: number;
};

export type AllocationResult = {
  allocations: Allocation[];
  /** Money left over — becomes credit on the client's account. */
  unappliedFils: number;
};

/**
 * Spreads one payment across open invoices, oldest due first.
 *
 * PLAIN ENGLISH: a client pays AED 1,000 against three unpaid invoices. This
 * clears the oldest first, which is what both accountants and courts expect,
 * and puts anything left over on their account rather than losing it.
 */
export function allocatePayment(
  amountFils: number,
  openInvoices: OpenInvoice[],
): AllocationResult {
  let remaining = Math.max(0, Math.round(amountFils));
  const allocations: Allocation[] = [];

  const oldestFirst = [...openInvoices]
    .filter((i) => i.balanceFils > 0)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  for (const invoice of oldestFirst) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, invoice.balanceFils);
    allocations.push({ invoiceId: invoice.id, invoiceNo: invoice.invoiceNo, amountFils: amount });
    remaining -= amount;
  }

  return { allocations, unappliedFils: remaining };
}

/* ---------------------------- aged receivables ---------------------------- */

export type AgingBucket = "CURRENT" | "DAYS_0_30" | "DAYS_31_60" | "DAYS_60_PLUS";

export type AgedRow = { balanceFils: number; dueDate: Date };

export type AgedReceivables = Record<AgingBucket, number> & { totalFils: number };

/** Which bucket a debt falls into, counting from its due date. */
export function agingBucketOf(dueDate: Date, now: Date): AgingBucket {
  const dueMidnight = new Date(dueDate);
  dueMidnight.setHours(23, 59, 59, 999);
  if (now <= dueMidnight) return "CURRENT";

  const days = Math.floor((now.getTime() - dueMidnight.getTime()) / 86_400_000) + 1;
  if (days <= 30) return "DAYS_0_30";
  if (days <= 60) return "DAYS_31_60";
  return "DAYS_60_PLUS";
}

/** The aged receivables report: how old is the money owed to you. */
export function agedReceivables(rows: AgedRow[], now: Date): AgedReceivables {
  const out: AgedReceivables = {
    CURRENT: 0, DAYS_0_30: 0, DAYS_31_60: 0, DAYS_60_PLUS: 0, totalFils: 0,
  };
  for (const row of rows) {
    if (row.balanceFils <= 0) continue;
    out[agingBucketOf(row.dueDate, now)] += row.balanceFils;
    out.totalFils += row.balanceFils;
  }
  return out;
}

/* ------------------------------- credit notes ----------------------------- */

export type CreditNoteCheck = {
  allowed: boolean;
  maxCreditableFils: number;
  reason?: "EXCEEDS_INVOICE" | "INVOICE_VOID" | "NOTHING_TO_CREDIT";
};

/**
 * Can this credit note be raised?
 *
 * You may never credit more than the invoice was for — that is how books stop
 * balancing, and it is exactly the sort of thing an auditor looks for.
 */
export function checkCreditNote(input: {
  invoiceTotalFils: number;
  alreadyCreditedFils: number;
  requestedFils: number;
  isVoid: boolean;
}): CreditNoteCheck {
  const maxCreditableFils = Math.max(0, input.invoiceTotalFils - input.alreadyCreditedFils);

  if (input.isVoid) return { allowed: false, maxCreditableFils: 0, reason: "INVOICE_VOID" };
  if (maxCreditableFils === 0) {
    return { allowed: false, maxCreditableFils: 0, reason: "NOTHING_TO_CREDIT" };
  }
  if (input.requestedFils > maxCreditableFils) {
    return { allowed: false, maxCreditableFils, reason: "EXCEEDS_INVOICE" };
  }
  return { allowed: true, maxCreditableFils };
}

/* ---------------------------- prepaid packages ---------------------------- */

export type PackageBalance = {
  sessionsTotal: number;
  sessionsUsed: number;
  expiresAt: Date | null;
  status: string;
};

export type PackageUseCheck = {
  canUse: boolean;
  sessionsRemaining: number;
  reason?: "NONE_LEFT" | "EXPIRED" | "NOT_ACTIVE";
};

/**
 * Whether a prepaid session can be spent on a job.
 *
 * If it can, the job is NOT invoiced — the client already paid for it.
 */
export function checkPackageUse(pkg: PackageBalance, now: Date): PackageUseCheck {
  const sessionsRemaining = Math.max(0, pkg.sessionsTotal - pkg.sessionsUsed);

  if (pkg.status !== "ACTIVE") return { canUse: false, sessionsRemaining, reason: "NOT_ACTIVE" };
  if (pkg.expiresAt && pkg.expiresAt < now) {
    return { canUse: false, sessionsRemaining, reason: "EXPIRED" };
  }
  if (sessionsRemaining <= 0) return { canUse: false, sessionsRemaining, reason: "NONE_LEFT" };

  return { canUse: true, sessionsRemaining };
}

/** What one prepaid session cost, for reporting revenue honestly. */
export function sessionValueFils(pricePaidFils: number, sessionsTotal: number): number {
  if (sessionsTotal <= 0) return 0;
  return Math.round(pricePaidFils / sessionsTotal);
}

/* ------------------------------- dunning ---------------------------------- */

export type DunningStep = { step: number; offsetDays: number; dueAt: Date };

/**
 * When each payment reminder should go out.
 *
 * The offsets come from your settings — [0, 3, 7] means on the due date, then
 * three days late, then a week late.
 */
export function dunningSchedule(dueDate: Date, offsetsDays: number[]): DunningStep[] {
  return offsetsDays.map((offsetDays, index) => {
    const dueAt = new Date(dueDate);
    dueAt.setDate(dueAt.getDate() + offsetDays);
    dueAt.setHours(9, 0, 0, 0); // a civilised hour, not midnight
    return { step: index + 1, offsetDays, dueAt };
  });
}

/** Should this client be stopped from booking because of what they owe? */
export function shouldPauseForDebt(input: {
  daysOverdue: number;
  autoPauseEnabled: boolean;
  pauseAfterDays: number;
  alreadyPaused: boolean;
}): boolean {
  if (!input.autoPauseEnabled || input.alreadyPaused) return false;
  return input.daysOverdue >= input.pauseAfterDays;
}
