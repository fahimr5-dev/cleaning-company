/**
 * Money helpers.
 *
 * PLAIN ENGLISH: every amount in this system is a whole number of fils, because
 * computers get decimals slightly wrong and 5% VAT on thousands of invoices is
 * exactly where that goes visibly wrong. AED 249.50 is stored as 24950.
 *
 * Nothing outside this file should ever do maths on money.
 */

export const FILS_PER_AED = 100;

/** Turn a human amount in dirhams into storable fils. `aed(249.5)` -> 24950 */
export function aed(dirhams: number): number {
  return Math.round(dirhams * FILS_PER_AED);
}

/** Turn stored fils back into a number of dirhams. 24950 -> 249.5 */
export function toAed(fils: number): number {
  return fils / FILS_PER_AED;
}

/**
 * Format fils for display, e.g. 24950 -> "AED 249.50" (or "‏د.إ‏ ٢٤٩٫٥٠" in Arabic).
 */
export function formatMoney(
  fils: number,
  locale: "en" | "ar" = "en",
  currency = "AED",
): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toAed(fils));
}

/**
 * VAT, calculated on VAT-EXCLUSIVE prices (confirmed with the founder: a quoted
 * AED 300 job invoices as AED 300 + AED 15 VAT = AED 315).
 *
 * `rateBps` is in basis points: 500 = 5.00%.
 * Rounds half-up to the nearest fils, which is what the FTA expects.
 */
export function vatOn(netFils: number, rateBps: number): number {
  return Math.round((netFils * rateBps) / 10000);
}

/** Net + VAT, the number the client actually pays. */
export function grossOf(netFils: number, rateBps: number): number {
  return netFils + vatOn(netFils, rateBps);
}

/**
 * If you ever switch to VAT-INCLUSIVE pricing, this pulls the VAT back out of a
 * gross amount. Unused today — kept because getting this backwards costs 5% of
 * revenue and the formula is not obvious.
 */
export function vatWithin(grossFils: number, rateBps: number): number {
  return Math.round((grossFils * rateBps) / (10000 + rateBps));
}

/** Apply a basis-point discount, e.g. 1500 bps = 15% off. */
export function applyDiscountBps(fils: number, discountBps: number): number {
  return fils - Math.round((fils * discountBps) / 10000);
}
