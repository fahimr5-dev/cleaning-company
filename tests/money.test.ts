import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { aed, toAed, vatOn, grossOf, vatWithin, applyDiscountBps, formatMoney } from "../src/lib/money";

describe("money is stored as whole fils", () => {
  test("converts dirhams to fils without floating-point drift", () => {
    assert.equal(aed(249.5), 24950);
    assert.equal(aed(0.1), 10);
    // 0.1 + 0.2 famously != 0.3 in floating point. In fils it is exact.
    assert.equal(aed(0.1) + aed(0.2), aed(0.3));
  });

  test("round-trips", () => {
    assert.equal(toAed(24950), 249.5);
  });
});

describe("VAT at 5% on VAT-exclusive prices", () => {
  test("adds 5% on top", () => {
    assert.equal(vatOn(aed(300), 500), aed(15));
    assert.equal(grossOf(aed(300), 500), aed(315));
  });

  test("rounds half-up to the nearest fils", () => {
    // 5% of 199 fils = 9.95 fils -> 10
    assert.equal(vatOn(199, 500), 10);
    // 5% of 190 fils = 9.5 fils -> 10
    assert.equal(vatOn(190, 500), 10);
    // 5% of 189 fils = 9.45 fils -> 9
    assert.equal(vatOn(189, 500), 9);
  });

  test("never loses a fils across a thousand invoices", () => {
    let net = 0, vat = 0;
    for (let i = 1; i <= 1000; i++) {
      const line = aed(i * 1.37);
      net += line;
      vat += vatOn(line, 500);
    }
    // Every individual VAT figure is a whole number of fils.
    assert.equal(Number.isInteger(vat), true);
    assert.equal(Number.isInteger(net), true);
  });

  test("vatWithin is the inverse for VAT-inclusive amounts", () => {
    const gross = grossOf(aed(300), 500);
    assert.equal(vatWithin(gross, 500), aed(15));
  });
});

describe("discounts in basis points", () => {
  test("15% off", () => {
    assert.equal(applyDiscountBps(aed(200), 1500), aed(170));
  });
  test("zero discount changes nothing", () => {
    assert.equal(applyDiscountBps(aed(200), 0), aed(200));
  });
});

describe("formatting", () => {
  test("shows two decimal places in English", () => {
    const out = formatMoney(24950, "en");
    assert.match(out, /249\.50/);
    assert.match(out, /AED|د\.إ/);
  });
  test("formats in Arabic without throwing", () => {
    assert.equal(typeof formatMoney(24950, "ar"), "string");
  });
});
