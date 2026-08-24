import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { priceService, totalsFor, type RateCardRule } from "../src/lib/pricing";
import { aed } from "../src/lib/money";

/** A stand-in for a rate card row, matching the seeded regular-apartment rule. */
const regularApartment: RateCardRule = {
  pricingModel: "PER_ROOM",
  basePriceFils: aed(90),
  perBedroomFils: aed(25),
  perBathroomFils: aed(20),
  perSqmFils: 0,
  perHourFils: 0,
  perUnitFils: 0,
  minimumChargeFils: aed(120),
  minutesBase: 60,
  minutesPerBedroom: 20,
  minutesPerBathroom: 15,
  minutesPer100Sqm: 0,
  minutesPerUnit: 0,
};

describe("per-room pricing", () => {
  test("base + per bedroom + per bathroom", () => {
    // 90 + (2 x 25) + (2 x 20) = 180
    const out = priceService(regularApartment, { bedrooms: 2, bathrooms: 2 });
    assert.equal(out.netFils, aed(180));
    assert.equal(out.minimumApplied, false);
  });

  test("the minimum charge protects a tiny job", () => {
    // 90 + 0 + (1 x 20) = 110, which is below the 120 minimum.
    const out = priceService(regularApartment, { bedrooms: 0, bathrooms: 1 });
    assert.equal(out.netFils, aed(120));
    assert.equal(out.minimumApplied, true);
  });

  test("duration is rounded up to the next quarter hour", () => {
    // 60 + (1 x 20) + (1 x 15) = 95 minutes -> 105
    const out = priceService(regularApartment, { bedrooms: 1, bathrooms: 1 });
    assert.equal(out.minutes, 105);
    assert.equal(out.minutes % 15, 0);
  });

  test("missing sizes are treated as zero, not as NaN", () => {
    const out = priceService(regularApartment, {});
    assert.equal(Number.isFinite(out.netFils), true);
    assert.equal(out.netFils, aed(120)); // falls back to the minimum
  });
});

describe("per-square-metre and per-unit pricing", () => {
  const office: RateCardRule = {
    ...regularApartment,
    pricingModel: "PER_SQM",
    basePriceFils: aed(100),
    perSqmFils: aed(0.6),
    minimumChargeFils: aed(200),
    minutesBase: 60,
    minutesPer100Sqm: 25,
  };

  test("prices by area", () => {
    // 100 + (200 x 0.60) = 220
    assert.equal(priceService(office, { sqm: 200 }).netFils, aed(220));
  });

  const acDuct: RateCardRule = {
    ...regularApartment,
    pricingModel: "PER_UNIT",
    basePriceFils: 0,
    perUnitFils: aed(90),
    minimumChargeFils: aed(350),
    minutesBase: 45,
    minutesPerUnit: 25,
  };

  test("prices by countable unit", () => {
    // 8 vents x 90 = 720
    assert.equal(priceService(acDuct, { units: 8 }).netFils, aed(720));
  });

  test("minimum applies to units too", () => {
    // 2 vents x 90 = 180, below the 350 minimum
    assert.equal(priceService(acDuct, { units: 2 }).netFils, aed(350));
  });
});

describe("totals: discount first, then VAT on top", () => {
  test("weekly discount then 5% VAT", () => {
    // 200 net, 15% weekly discount -> 170, VAT 8.50 -> 178.50
    const t = totalsFor([aed(200)], 1500, 500);
    assert.equal(t.subtotalFils, aed(200));
    assert.equal(t.discountFils, aed(30));
    assert.equal(t.netFils, aed(170));
    assert.equal(t.vatFils, aed(8.5));
    assert.equal(t.totalFils, aed(178.5));
  });

  test("VAT is charged on the discounted amount, not the list price", () => {
    const t = totalsFor([aed(200)], 1500, 500);
    assert.notEqual(t.vatFils, aed(10)); // would be 10 if VAT ignored the discount
    assert.equal(t.vatFils, aed(8.5));
  });

  test("an extra discount stacks on top of the frequency discount", () => {
    // 200 -> 15% off = 170 -> minus a 50 referral = 120, VAT 6 -> 126
    const t = totalsFor([aed(200)], 1500, 500, aed(50));
    assert.equal(t.netFils, aed(120));
    assert.equal(t.totalFils, aed(126));
  });

  test("discounts can never push a total below zero", () => {
    const t = totalsFor([aed(50)], 0, 500, aed(500));
    assert.equal(t.netFils, 0);
    assert.equal(t.totalFils, 0);
  });

  test("adds up multiple lines", () => {
    const t = totalsFor([aed(180), aed(720)], 0, 500);
    assert.equal(t.subtotalFils, aed(900));
    assert.equal(t.totalFils, aed(945));
  });
});
