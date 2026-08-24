/**
 * The rules that keep the van stocked and the machines serviced.
 *
 * PLAIN ENGLISH: how much of each chemical you actually have, when to reorder,
 * what a job cost you in materials, and which machine is due a service. Pure
 * arithmetic with no database and no clock of its own.
 *
 * Quantities can have decimals — half a litre is a real amount — but money is
 * always whole fils.
 */

const DAY_MS = 86_400_000;

/* --------------------------------- stock ---------------------------------- */

export type Movement = {
  type: string;
  /** Positive adds stock, negative removes it. */
  quantity: number;
};

/**
 * How much is on the shelf, worked out from the movements rather than trusted
 * from a running total somebody might have updated in one place and not another.
 *
 * The sign is taken from the movement type, not from whoever typed the number:
 * an ISSUE_TO_TEAM of 5 always removes 5, however it was entered.
 */
export function quantityOnHand(movements: Movement[]): number {
  const total = movements.reduce((running, m) => running + signedQuantity(m), 0);
  // Three decimal places, matching the column, so 0.1 + 0.2 never reads 0.30000000000000004.
  return Math.round(total * 1000) / 1000;
}

/** What one movement does to the shelf, with the sign forced by its type. */
export function signedQuantity(movement: Movement): number {
  const size = Math.abs(movement.quantity);
  switch (movement.type) {
    case "PURCHASE":
    case "RETURN":
      return size;
    case "ISSUE_TO_TEAM":
    case "WASTAGE":
      return -size;
    case "ADJUSTMENT":
      // A stock count correction is the one case where the sign is meaningful:
      // it can go either way, and the person counting decides.
      return movement.quantity;
    default:
      return movement.quantity;
  }
}

export type StockLevel = "OUT_OF_STOCK" | "REORDER" | "LOW" | "OK";

export type StockStatus = {
  level: StockLevel;
  onHand: number;
  reorderLevel: number;
  /** How much to buy to get comfortably back above the reorder level. */
  suggestedOrderQty: number;
};

/**
 * Whether an item needs ordering.
 *
 * "LOW" is a nudge at 25% above the reorder level, so you find out before you
 * are actually short — ordering chemicals in Dubai is not same-day.
 */
export function stockStatus(input: {
  onHand: number;
  reorderLevel: number;
  /** How many of these you like to hold. Defaults to twice the reorder level. */
  targetLevel?: number;
}): StockStatus {
  const target = input.targetLevel ?? input.reorderLevel * 2;
  const suggested = Math.max(0, Math.round((target - input.onHand) * 1000) / 1000);

  const level: StockLevel =
    input.onHand <= 0
      ? "OUT_OF_STOCK"
      : input.onHand <= input.reorderLevel
        ? "REORDER"
        : input.onHand <= input.reorderLevel * 1.25
          ? "LOW"
          : "OK";

  return { level, onHand: input.onHand, reorderLevel: input.reorderLevel, suggestedOrderQty: suggested };
}

/** True when this item's low-stock warning should be sent again. */
export function shouldAlertLowStock(input: {
  level: StockLevel;
  lastAlertedAt: Date | null;
  now: Date;
  /** Don't repeat the same warning more often than this. */
  quietDays?: number;
}): boolean {
  if (input.level === "OK" || input.level === "LOW") return false;
  if (!input.lastAlertedAt) return true;
  const days = (input.now.getTime() - input.lastAlertedAt.getTime()) / DAY_MS;
  return days >= (input.quietDays ?? 7);
}

/* ---------------------------- cost of a job ------------------------------- */

export type ConsumableLine = { quantity: number; unitCostFils: number };

/**
 * What the materials on one job cost you.
 *
 * This is what turns "we charged AED 300" into "we made AED 240", which is the
 * only number that tells you whether a service is worth selling.
 */
export function consumablesCostFils(lines: ConsumableLine[]): number {
  return lines.reduce(
    (total, line) => total + Math.round(line.quantity * line.unitCostFils),
    0,
  );
}

export type JobMargin = {
  revenueFils: number;
  materialsFils: number;
  labourFils: number;
  grossProfitFils: number;
  /** Basis points, so 3250 = 32.50%. Null when there is no revenue to divide by. */
  marginBps: number | null;
};

/**
 * Profit on one job.
 *
 * Revenue is taken EXCLUDING VAT, because the VAT was never yours — it belongs
 * to the FTA and counting it as income overstates every margin you look at.
 */
export function jobMargin(input: {
  revenueExVatFils: number;
  materialsFils: number;
  labourMinutes: number;
  labourCostPerHourFils: number;
}): JobMargin {
  const labourFils = Math.round((input.labourMinutes / 60) * input.labourCostPerHourFils);
  const grossProfitFils = input.revenueExVatFils - input.materialsFils - labourFils;

  return {
    revenueFils: input.revenueExVatFils,
    materialsFils: input.materialsFils,
    labourFils,
    grossProfitFils,
    marginBps: input.revenueExVatFils > 0
      ? Math.round((grossProfitFils / input.revenueExVatFils) * 10_000)
      : null,
  };
}

/* ------------------------------- equipment -------------------------------- */

export type MaintenanceStatus = "OVERDUE" | "DUE_SOON" | "SCHEDULED" | "NOT_SCHEDULED";

export type MaintenanceCheck = {
  status: MaintenanceStatus;
  daysUntilDue: number | null;
  /** True when the machine should not be sent out until it is serviced. */
  withhold: boolean;
};

/**
 * Whether a machine is due a service.
 *
 * A machine already marked IN_REPAIR, RETIRED or LOST is withheld whatever its
 * service date says — it is not in the van either way.
 */
export function maintenanceStatus(input: {
  status: string;
  nextDueAt: Date | null;
  now: Date;
  dueSoonDays?: number;
}): MaintenanceCheck {
  const unavailable = input.status !== "IN_SERVICE";

  if (!input.nextDueAt) {
    return { status: "NOT_SCHEDULED", daysUntilDue: null, withhold: unavailable };
  }

  const days = Math.floor(
    (startOfDay(input.nextDueAt).getTime() - startOfDay(input.now).getTime()) / DAY_MS,
  );
  const soon = input.dueSoonDays ?? 14;

  const status: MaintenanceStatus =
    days < 0 ? "OVERDUE" : days <= soon ? "DUE_SOON" : "SCHEDULED";

  return { status, daysUntilDue: days, withhold: unavailable || status === "OVERDUE" };
}

/** When the next service falls due after one has been carried out. */
export function nextMaintenanceDue(performedAt: Date, intervalDays: number | null): Date | null {
  if (!intervalDays || intervalDays <= 0) return null;
  return new Date(startOfDay(performedAt).getTime() + intervalDays * DAY_MS);
}

/** Midnight, so "due today" is not "overdue" because of the time of day. */
export function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}
