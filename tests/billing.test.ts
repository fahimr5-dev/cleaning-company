import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  lineTotals, invoiceTotals, settleInvoice, allocatePayment,
  agingBucketOf, agedReceivables, checkCreditNote, checkPackageUse,
  sessionValueFils, dunningSchedule, shouldPauseForDebt,
} from "../src/lib/billing";
import { aed } from "../src/lib/money";

const VAT5 = 500;

describe("one invoice line", () => {
  test("quantity times price, plus 5% VAT", () => {
    const t = lineTotals({ quantity: 1, unitPriceFils: aed(300), vatRateBps: VAT5 });
    assert.equal(t.netFils, aed(300));
    assert.equal(t.vatFils, aed(15));
    assert.equal(t.totalFils, aed(315));
  });

  test("several units", () => {
    const t = lineTotals({ quantity: 8, unitPriceFils: aed(90), vatRateBps: VAT5 });
    assert.equal(t.grossFils, aed(720));
    assert.equal(t.totalFils, aed(756));
  });

  test("VAT is charged after the discount, not before", () => {
    const t = lineTotals({
      quantity: 1, unitPriceFils: aed(300), discountFils: aed(100), vatRateBps: VAT5,
    });
    assert.equal(t.netFils, aed(200));
    assert.equal(t.vatFils, aed(10), "5% of 200, not of 300");
  });

  test("a discount can never exceed the line itself", () => {
    const t = lineTotals({
      quantity: 1, unitPriceFils: aed(100), discountFils: aed(500), vatRateBps: VAT5,
    });
    assert.equal(t.netFils, 0);
    assert.equal(t.totalFils, 0);
  });

  test("a zero-rated line carries no VAT", () => {
    const t = lineTotals({ quantity: 1, unitPriceFils: aed(300), vatRateBps: 0 });
    assert.equal(t.vatFils, 0);
    assert.equal(t.totalFils, aed(300));
  });
});

describe("a whole invoice", () => {
  test("adds up its lines", () => {
    const t = invoiceTotals([
      { quantity: 1, unitPriceFils: aed(790), vatRateBps: VAT5 },
      { quantity: 8, unitPriceFils: aed(90), vatRateBps: VAT5 },
    ]);
    assert.equal(t.netFils, aed(1510));
    assert.equal(t.vatFils, aed(75.5));
    assert.equal(t.totalFils, aed(1585.5));
  });

  test("VAT is worked out per line, so mixed rates stay correct", () => {
    // Doing 5% on the total would give 20; the right answer is 15.
    const t = invoiceTotals([
      { quantity: 1, unitPriceFils: aed(300), vatRateBps: VAT5 },
      { quantity: 1, unitPriceFils: aed(100), vatRateBps: 0 },
    ]);
    assert.equal(t.vatFils, aed(15));
    assert.equal(t.totalFils, aed(415));
  });

  test("splits VAT by rate, which a VAT return needs", () => {
    const t = invoiceTotals([
      { quantity: 1, unitPriceFils: aed(300), vatRateBps: VAT5 },
      { quantity: 1, unitPriceFils: aed(200), vatRateBps: VAT5 },
      { quantity: 1, unitPriceFils: aed(100), vatRateBps: 0 },
    ]);
    assert.deepEqual(t.vatByRate, [
      { rateBps: 500, netFils: aed(500), vatFils: aed(25) },
      { rateBps: 0, netFils: aed(100), vatFils: 0 },
    ]);
  });

  test("an empty invoice is zero, not NaN", () => {
    const t = invoiceTotals([]);
    assert.equal(t.totalFils, 0);
    assert.equal(Number.isFinite(t.vatFils), true);
  });

  test("rounding never drifts across many lines", () => {
    // 199 fils a line: VAT is 9.95 fils each, which must round consistently.
    const lines = Array.from({ length: 100 }, () => ({
      quantity: 1, unitPriceFils: 199, vatRateBps: VAT5,
    }));
    const t = invoiceTotals(lines);
    assert.equal(t.vatFils, 100 * 10, "each line rounds to 10 fils");
    assert.equal(Number.isInteger(t.totalFils), true);
  });
});

describe("where an invoice stands", () => {
  const dueDate = new Date(2026, 0, 10);
  const base = { totalFils: aed(315), paidFils: 0, creditedFils: 0, dueDate };

  test("nothing paid, not yet due", () => {
    const s = settleInvoice({ ...base, now: new Date(2026, 0, 5) });
    assert.equal(s.status, "ISSUED");
    assert.equal(s.balanceFils, aed(315));
  });

  test("part paid", () => {
    const s = settleInvoice({ ...base, paidFils: aed(100), now: new Date(2026, 0, 5) });
    assert.equal(s.status, "PARTIALLY_PAID");
    assert.equal(s.balanceFils, aed(215));
  });

  test("paid in full", () => {
    const s = settleInvoice({ ...base, paidFils: aed(315), now: new Date(2026, 0, 5) });
    assert.equal(s.status, "PAID");
    assert.equal(s.balanceFils, 0);
  });

  test("overpaid still counts as paid, never negative", () => {
    const s = settleInvoice({ ...base, paidFils: aed(400), now: new Date(2026, 0, 5) });
    assert.equal(s.status, "PAID");
    assert.equal(s.balanceFils, 0);
  });

  test("unpaid past the due date is overdue", () => {
    const s = settleInvoice({ ...base, now: new Date(2026, 0, 15) });
    assert.equal(s.status, "OVERDUE");
    assert.equal(s.daysOverdue, 5);
  });

  test("the due date itself is not yet late", () => {
    const s = settleInvoice({ ...base, now: new Date(2026, 0, 10, 18, 0) });
    assert.equal(s.status, "ISSUED");
    assert.equal(s.isOverdue, false);
  });

  test("a credit note settles an invoice just as a payment does", () => {
    const s = settleInvoice({ ...base, creditedFils: aed(315), now: new Date(2026, 0, 20) });
    assert.equal(s.status, "PAID");
    assert.equal(s.balanceFils, 0);
    assert.equal(s.isOverdue, false, "a credited invoice is not chased");
  });

  test("a part payment and a part credit together settle it", () => {
    const s = settleInvoice({
      ...base, paidFils: aed(200), creditedFils: aed(115), now: new Date(2026, 0, 20),
    });
    assert.equal(s.status, "PAID");
  });

  test("a voided invoice owes nothing and is never chased", () => {
    const s = settleInvoice({ ...base, isVoid: true, now: new Date(2026, 5, 1) });
    assert.equal(s.status, "VOID");
    assert.equal(s.balanceFils, 0);
    assert.equal(s.isOverdue, false);
  });

  test("a draft is never overdue", () => {
    const s = settleInvoice({ ...base, isDraft: true, now: new Date(2026, 5, 1) });
    assert.equal(s.status, "DRAFT");
    assert.equal(s.isOverdue, false);
  });
});

describe("applying one payment to several invoices", () => {
  const invoices = [
    { id: "b", invoiceNo: "INV-2", balanceFils: aed(300), dueDate: new Date(2026, 1, 1) },
    { id: "a", invoiceNo: "INV-1", balanceFils: aed(200), dueDate: new Date(2026, 0, 1) },
    { id: "c", invoiceNo: "INV-3", balanceFils: aed(500), dueDate: new Date(2026, 2, 1) },
  ];

  test("clears the oldest first", () => {
    const out = allocatePayment(aed(400), invoices);
    assert.deepEqual(out.allocations.map((a) => a.invoiceNo), ["INV-1", "INV-2"]);
    assert.equal(out.allocations[0].amountFils, aed(200));
    assert.equal(out.allocations[1].amountFils, aed(200), "partly clears the next one");
    assert.equal(out.unappliedFils, 0);
  });

  test("money left over is not lost — it becomes credit", () => {
    const out = allocatePayment(aed(1200), invoices);
    assert.equal(out.allocations.length, 3);
    assert.equal(out.unappliedFils, aed(200));
  });

  test("every fils is accounted for", () => {
    const paid = aed(650);
    const out = allocatePayment(paid, invoices);
    const applied = out.allocations.reduce((t, a) => t + a.amountFils, 0);
    assert.equal(applied + out.unappliedFils, paid);
  });

  test("a payment with nothing to pay stays entirely unapplied", () => {
    const out = allocatePayment(aed(100), []);
    assert.equal(out.allocations.length, 0);
    assert.equal(out.unappliedFils, aed(100));
  });

  test("already-settled invoices are skipped", () => {
    const out = allocatePayment(aed(100), [
      { id: "z", invoiceNo: "INV-0", balanceFils: 0, dueDate: new Date(2025, 0, 1) },
      ...invoices,
    ]);
    assert.equal(out.allocations[0].invoiceNo, "INV-1");
  });
});

describe("aged receivables", () => {
  const now = new Date(2026, 3, 1); // 1 April

  test("puts each debt in the right bucket", () => {
    assert.equal(agingBucketOf(new Date(2026, 3, 15), now), "CURRENT");
    assert.equal(agingBucketOf(new Date(2026, 2, 20), now), "DAYS_0_30");
    assert.equal(agingBucketOf(new Date(2026, 1, 10), now), "DAYS_31_60");
    assert.equal(agingBucketOf(new Date(2025, 11, 1), now), "DAYS_60_PLUS");
  });

  test("totals each bucket", () => {
    const report = agedReceivables([
      { balanceFils: aed(100), dueDate: new Date(2026, 3, 15) },
      { balanceFils: aed(200), dueDate: new Date(2026, 2, 20) },
      { balanceFils: aed(300), dueDate: new Date(2026, 1, 10) },
      { balanceFils: aed(400), dueDate: new Date(2025, 11, 1) },
    ], now);
    assert.equal(report.CURRENT, aed(100));
    assert.equal(report.DAYS_0_30, aed(200));
    assert.equal(report.DAYS_31_60, aed(300));
    assert.equal(report.DAYS_60_PLUS, aed(400));
    assert.equal(report.totalFils, aed(1000));
  });

  test("settled invoices are left out", () => {
    const report = agedReceivables([
      { balanceFils: 0, dueDate: new Date(2025, 0, 1) },
    ], now);
    assert.equal(report.totalFils, 0);
  });
});

describe("credit notes", () => {
  test("a normal credit is allowed", () => {
    const c = checkCreditNote({
      invoiceTotalFils: aed(315), alreadyCreditedFils: 0, requestedFils: aed(100), isVoid: false,
    });
    assert.equal(c.allowed, true);
    assert.equal(c.maxCreditableFils, aed(315));
  });

  test("you can never credit more than the invoice", () => {
    const c = checkCreditNote({
      invoiceTotalFils: aed(315), alreadyCreditedFils: 0, requestedFils: aed(400), isVoid: false,
    });
    assert.equal(c.allowed, false);
    assert.equal(c.reason, "EXCEEDS_INVOICE");
  });

  test("earlier credits count towards the limit", () => {
    const c = checkCreditNote({
      invoiceTotalFils: aed(315), alreadyCreditedFils: aed(300), requestedFils: aed(50), isVoid: false,
    });
    assert.equal(c.allowed, false);
    assert.equal(c.maxCreditableFils, aed(15));
  });

  test("a fully credited invoice has nothing left to credit", () => {
    const c = checkCreditNote({
      invoiceTotalFils: aed(315), alreadyCreditedFils: aed(315), requestedFils: aed(1), isVoid: false,
    });
    assert.equal(c.reason, "NOTHING_TO_CREDIT");
  });

  test("a voided invoice cannot be credited", () => {
    const c = checkCreditNote({
      invoiceTotalFils: aed(315), alreadyCreditedFils: 0, requestedFils: aed(10), isVoid: true,
    });
    assert.equal(c.reason, "INVOICE_VOID");
  });
});

describe("prepaid packages", () => {
  const now = new Date(2026, 0, 15);
  const base = { sessionsTotal: 10, sessionsUsed: 3, expiresAt: new Date(2026, 11, 1), status: "ACTIVE" };

  test("a session can be spent while some are left", () => {
    const c = checkPackageUse(base, now);
    assert.equal(c.canUse, true);
    assert.equal(c.sessionsRemaining, 7);
  });

  test("an exhausted package cannot be spent", () => {
    const c = checkPackageUse({ ...base, sessionsUsed: 10 }, now);
    assert.equal(c.canUse, false);
    assert.equal(c.reason, "NONE_LEFT");
    assert.equal(c.sessionsRemaining, 0);
  });

  test("an expired package cannot be spent", () => {
    const c = checkPackageUse({ ...base, expiresAt: new Date(2025, 11, 1) }, now);
    assert.equal(c.reason, "EXPIRED");
  });

  test("a cancelled package cannot be spent", () => {
    const c = checkPackageUse({ ...base, status: "CANCELLED" }, now);
    assert.equal(c.reason, "NOT_ACTIVE");
  });

  test("a package with no expiry never expires", () => {
    const c = checkPackageUse({ ...base, expiresAt: null }, new Date(2040, 0, 1));
    assert.equal(c.canUse, true);
  });

  test("what one session was worth", () => {
    assert.equal(sessionValueFils(aed(1620), 10), aed(162));
    assert.equal(sessionValueFils(aed(100), 0), 0, "never divides by zero");
  });
});

describe("payment reminders", () => {
  test("schedules on the due date, +3 and +7", () => {
    const steps = dunningSchedule(new Date(2026, 0, 10), [0, 3, 7]);
    assert.equal(steps.length, 3);
    assert.equal(steps[0].dueAt.getDate(), 10);
    assert.equal(steps[1].dueAt.getDate(), 13);
    assert.equal(steps[2].dueAt.getDate(), 17);
    assert.equal(steps[0].dueAt.getHours(), 9, "sent at a civilised hour");
  });

  test("honours whatever schedule you configure", () => {
    const steps = dunningSchedule(new Date(2026, 0, 10), [1, 14]);
    assert.deepEqual(steps.map((s) => s.offsetDays), [1, 14]);
  });
});

describe("pausing a client who owes money", () => {
  test("pauses once they are far enough past due", () => {
    assert.equal(shouldPauseForDebt({
      daysOverdue: 20, autoPauseEnabled: true, pauseAfterDays: 14, alreadyPaused: false,
    }), true);
  });

  test("does nothing when the feature is switched off", () => {
    assert.equal(shouldPauseForDebt({
      daysOverdue: 99, autoPauseEnabled: false, pauseAfterDays: 14, alreadyPaused: false,
    }), false);
  });

  test("does not pause somebody twice", () => {
    assert.equal(shouldPauseForDebt({
      daysOverdue: 99, autoPauseEnabled: true, pauseAfterDays: 14, alreadyPaused: true,
    }), false);
  });

  test("leaves a client alone until the threshold", () => {
    assert.equal(shouldPauseForDebt({
      daysOverdue: 5, autoPauseEnabled: true, pauseAfterDays: 14, alreadyPaused: false,
    }), false);
  });
});
