import { applyDiscountBps, vatOn } from "./money";

/**
 * Turns a rate-card rule plus the size of a property into a price and a
 * duration.
 *
 * PLAIN ENGLISH: this is the single place the system works out what a job
 * costs. The website calculator, the admin booking screen and the demo-data
 * seed all call this same function, so a price can never mean two different
 * things in two different screens. The numbers themselves come from the rate
 * card in the database — nothing is hardcoded here.
 */

/** The size details a customer gives us. */
export type PricingInputs = {
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqm?: number | null;
  /** Countable extras: AC vents, sofa seats, carpets. */
  units?: number | null;
  /** Only used by hourly rules. */
  hours?: number | null;
};

/** The shape of a RateCardItem row — kept structural so tests can fake it. */
export type RateCardRule = {
  pricingModel: "FLAT" | "PER_ROOM" | "PER_SQM" | "PER_HOUR" | "PER_UNIT";
  basePriceFils: number;
  perBedroomFils: number;
  perBathroomFils: number;
  perSqmFils: number;
  perHourFils: number;
  perUnitFils: number;
  minimumChargeFils: number;
  minutesBase: number;
  minutesPerBedroom: number;
  minutesPerBathroom: number;
  minutesPer100Sqm: number;
  minutesPerUnit: number;
};

export type PricedService = {
  /** Price before any frequency discount and before VAT. */
  netFils: number;
  /** True when the minimum charge kicked in — worth showing in the admin UI. */
  minimumApplied: boolean;
  /** How long the job should take, rounded up to the next 15 minutes. */
  minutes: number;
};

const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Round a duration up to the next quarter hour so the calendar stays tidy. */
function roundMinutes(minutes: number): number {
  return Math.max(15, Math.ceil(minutes / 15) * 15);
}

export function priceService(rule: RateCardRule, inputs: PricingInputs): PricedService {
  const bedrooms = n(inputs.bedrooms);
  const bathrooms = n(inputs.bathrooms);
  const sqm = n(inputs.sqm);
  const units = n(inputs.units);
  const hours = n(inputs.hours);

  let raw = rule.basePriceFils;
  let minutes = rule.minutesBase;

  switch (rule.pricingModel) {
    case "PER_ROOM":
      raw += bedrooms * rule.perBedroomFils + bathrooms * rule.perBathroomFils;
      minutes += bedrooms * rule.minutesPerBedroom + bathrooms * rule.minutesPerBathroom;
      break;
    case "PER_SQM":
      raw += sqm * rule.perSqmFils;
      minutes += (sqm / 100) * rule.minutesPer100Sqm;
      break;
    case "PER_UNIT":
      raw += units * rule.perUnitFils;
      minutes += units * rule.minutesPerUnit;
      break;
    case "PER_HOUR":
      raw += hours * rule.perHourFils;
      minutes += hours * 60;
      break;
    case "FLAT":
      break;
  }

  const minimumApplied = raw < rule.minimumChargeFils;
  const netFils = minimumApplied ? rule.minimumChargeFils : Math.round(raw);

  return { netFils, minimumApplied, minutes: roundMinutes(minutes) };
}

export type QuoteTotals = {
  subtotalFils: number;
  discountFils: number;
  netFils: number;
  vatFils: number;
  totalFils: number;
};

/**
 * Adds up priced lines, applies the loyalty discount for the chosen frequency,
 * then adds VAT on top (our prices are VAT-EXCLUSIVE).
 */
export function totalsFor(
  lineNetFils: number[],
  frequencyDiscountBps: number,
  vatRateBps: number,
  extraDiscountFils = 0,
): QuoteTotals {
  const subtotalFils = lineNetFils.reduce((sum, v) => sum + v, 0);
  const afterFrequency = applyDiscountBps(subtotalFils, frequencyDiscountBps);
  const netFils = Math.max(0, afterFrequency - extraDiscountFils);
  const discountFils = subtotalFils - netFils;
  const vatFils = vatOn(netFils, vatRateBps);

  return { subtotalFils, discountFils, netFils, vatFils, totalFils: netFils + vatFils };
}
