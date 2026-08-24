import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  quantityOnHand, signedQuantity, stockStatus, shouldAlertLowStock,
  consumablesCostFils, jobMargin, maintenanceStatus, nextMaintenanceDue,
} from "../src/lib/stock";
import { aed } from "../src/lib/money";

const NOW = new Date("2026-06-01T09:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("what a movement does to the shelf", () => {
  test("a purchase adds, an issue removes", () => {
    assert.equal(signedQuantity({ type: "PURCHASE", quantity: 10 }), 10);
    assert.equal(signedQuantity({ type: "ISSUE_TO_TEAM", quantity: 4 }), -4);
  });

  test("wastage removes; a return puts it back", () => {
    assert.equal(signedQuantity({ type: "WASTAGE", quantity: 2 }), -2);
    assert.equal(signedQuantity({ type: "RETURN", quantity: 2 }), 2);
  });

  test("the type decides the sign, not however somebody typed the number", () => {
    // Entering "-5 issued" must still remove 5, never add it back.
    assert.equal(signedQuantity({ type: "ISSUE_TO_TEAM", quantity: -5 }), -5);
    assert.equal(signedQuantity({ type: "PURCHASE", quantity: -5 }), 5);
  });

  test("a stock-count correction is the one case that can go either way", () => {
    assert.equal(signedQuantity({ type: "ADJUSTMENT", quantity: -3 }), -3);
    assert.equal(signedQuantity({ type: "ADJUSTMENT", quantity: 3 }), 3);
  });
});

describe("how much is on the shelf", () => {
  test("purchases minus issues", () => {
    assert.equal(quantityOnHand([
      { type: "PURCHASE", quantity: 24 },
      { type: "ISSUE_TO_TEAM", quantity: 6 },
      { type: "ISSUE_TO_TEAM", quantity: 4 },
    ]), 14);
  });

  test("no movements is nothing on the shelf", () => {
    assert.equal(quantityOnHand([]), 0);
  });

  test("part-litres add up without floating-point rubbish", () => {
    assert.equal(quantityOnHand([
      { type: "PURCHASE", quantity: 0.1 },
      { type: "PURCHASE", quantity: 0.2 },
    ]), 0.3);
  });

  test("issuing more than you have shows negative rather than hiding it", () => {
    assert.equal(quantityOnHand([
      { type: "PURCHASE", quantity: 5 },
      { type: "ISSUE_TO_TEAM", quantity: 8 },
    ]), -3);
  });
});

describe("whether to reorder", () => {
  test("comfortably stocked is OK", () => {
    assert.equal(stockStatus({ onHand: 40, reorderLevel: 10 }).level, "OK");
  });

  test("a nudge before you are actually short", () => {
    assert.equal(stockStatus({ onHand: 12, reorderLevel: 10 }).level, "LOW");
  });

  test("at the reorder level it is time to buy", () => {
    assert.equal(stockStatus({ onHand: 10, reorderLevel: 10 }).level, "REORDER");
  });

  test("nothing left is its own state", () => {
    assert.equal(stockStatus({ onHand: 0, reorderLevel: 10 }).level, "OUT_OF_STOCK");
    assert.equal(stockStatus({ onHand: -2, reorderLevel: 10 }).level, "OUT_OF_STOCK");
  });

  test("it suggests how much to buy", () => {
    assert.equal(stockStatus({ onHand: 4, reorderLevel: 10 }).suggestedOrderQty, 16);
  });

  test("a target level of your own overrides the default", () => {
    assert.equal(stockStatus({ onHand: 4, reorderLevel: 10, targetLevel: 50 }).suggestedOrderQty, 46);
  });

  test("already above target suggests buying nothing, never a negative", () => {
    assert.equal(stockStatus({ onHand: 60, reorderLevel: 10 }).suggestedOrderQty, 0);
  });
});

describe("when to send the low-stock warning", () => {
  test("a healthy item is never warned about", () => {
    assert.equal(shouldAlertLowStock({ level: "OK", lastAlertedAt: null, now: NOW }), false);
  });

  test("a nudge-level item does not email you", () => {
    assert.equal(shouldAlertLowStock({ level: "LOW", lastAlertedAt: null, now: NOW }), false);
  });

  test("hitting the reorder level warns once", () => {
    assert.equal(shouldAlertLowStock({ level: "REORDER", lastAlertedAt: null, now: NOW }), true);
  });

  test("it does not nag every day", () => {
    assert.equal(
      shouldAlertLowStock({ level: "REORDER", lastAlertedAt: inDays(-2), now: NOW }),
      false,
    );
  });

  test("but it does warn again a week later", () => {
    assert.equal(
      shouldAlertLowStock({ level: "OUT_OF_STOCK", lastAlertedAt: inDays(-8), now: NOW }),
      true,
    );
  });
});

describe("what a job cost in materials", () => {
  test("quantity times unit cost, added up", () => {
    assert.equal(consumablesCostFils([
      { quantity: 2, unitCostFils: aed(12) },
      { quantity: 0.5, unitCostFils: aed(30) },
    ]), aed(39));
  });

  test("nothing used costs nothing", () => {
    assert.equal(consumablesCostFils([]), 0);
  });

  test("part-units round to whole fils", () => {
    assert.equal(consumablesCostFils([{ quantity: 0.333, unitCostFils: 1000 }]), 333);
  });
});

describe("profit on one job", () => {
  test("revenue minus materials minus labour", () => {
    const m = jobMargin({
      revenueExVatFils: aed(300),
      materialsFils: aed(20),
      labourMinutes: 240,
      labourCostPerHourFils: aed(15),
    });
    assert.equal(m.labourFils, aed(60));
    assert.equal(m.grossProfitFils, aed(220));
  });

  test("the margin is in basis points", () => {
    const m = jobMargin({
      revenueExVatFils: aed(100),
      materialsFils: aed(10),
      labourMinutes: 60,
      labourCostPerHourFils: aed(15),
    });
    assert.equal(m.grossProfitFils, aed(75));
    assert.equal(m.marginBps, 7500);
  });

  test("a job that lost money reports a negative margin honestly", () => {
    const m = jobMargin({
      revenueExVatFils: aed(100),
      materialsFils: aed(60),
      labourMinutes: 300,
      labourCostPerHourFils: aed(20),
    });
    assert.ok(m.grossProfitFils < 0, String(m.grossProfitFils));
    assert.ok(m.marginBps !== null && m.marginBps < 0);
  });

  test("no revenue gives no margin rather than dividing by zero", () => {
    const m = jobMargin({
      revenueExVatFils: 0, materialsFils: aed(10),
      labourMinutes: 60, labourCostPerHourFils: aed(15),
    });
    assert.equal(m.marginBps, null);
  });
});

describe("whether a machine is due a service", () => {
  test("a service months away is simply scheduled", () => {
    const m = maintenanceStatus({ status: "IN_SERVICE", nextDueAt: inDays(90), now: NOW });
    assert.equal(m.status, "SCHEDULED");
    assert.equal(m.withhold, false);
  });

  test("a fortnight out is due soon, and still usable", () => {
    const m = maintenanceStatus({ status: "IN_SERVICE", nextDueAt: inDays(10), now: NOW });
    assert.equal(m.status, "DUE_SOON");
    assert.equal(m.withhold, false);
  });

  test("an overdue service withholds the machine", () => {
    const m = maintenanceStatus({ status: "IN_SERVICE", nextDueAt: inDays(-1), now: NOW });
    assert.equal(m.status, "OVERDUE");
    assert.equal(m.withhold, true);
  });

  test("due today is not overdue", () => {
    assert.equal(
      maintenanceStatus({ status: "IN_SERVICE", nextDueAt: NOW, now: NOW }).status,
      "DUE_SOON",
    );
  });

  test("a machine in for repair is withheld whatever its service date says", () => {
    const m = maintenanceStatus({ status: "IN_REPAIR", nextDueAt: inDays(90), now: NOW });
    assert.equal(m.withhold, true);
  });

  test("a lost machine is withheld", () => {
    assert.equal(
      maintenanceStatus({ status: "LOST", nextDueAt: null, now: NOW }).withhold,
      true,
    );
  });

  test("no service schedule is stated plainly, not guessed at", () => {
    const m = maintenanceStatus({ status: "IN_SERVICE", nextDueAt: null, now: NOW });
    assert.equal(m.status, "NOT_SCHEDULED");
    assert.equal(m.daysUntilDue, null);
    assert.equal(m.withhold, false);
  });
});

describe("scheduling the next service", () => {
  test("the interval is added to the day it was done", () => {
    const next = nextMaintenanceDue(new Date("2026-06-01T14:00:00Z"), 90);
    assert.equal(next?.getFullYear(), 2026);
    assert.equal(next?.getMonth(), 7); // August
  });

  test("no interval means nothing is scheduled", () => {
    assert.equal(nextMaintenanceDue(NOW, null), null);
    assert.equal(nextMaintenanceDue(NOW, 0), null);
  });
});
