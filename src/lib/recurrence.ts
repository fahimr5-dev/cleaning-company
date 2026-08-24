/**
 * The recurring job engine.
 *
 * PLAIN ENGLISH: a client books "every Tuesday at 9am". You enter that once,
 * and this works out every future visit it should produce. If one Tuesday is a
 * public holiday and you skip it, the rest of the series carries on untouched.
 *
 * This file is deliberately pure date arithmetic — no database, no clock of its
 * own. Everything it needs is passed in, which is what makes it testable.
 */

export const FREQUENCIES = ["ONE_OFF", "WEEKLY", "BI_WEEKLY", "MONTHLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export type RecurrenceRule = {
  frequency: Frequency;
  /** Repeat every N periods. 1 = every week, 2 = every other week. */
  interval: number;
  /** Days of the week it lands on, 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  startDate: Date;
  endDate?: Date | null;
  /** Stop after this many visits, if set. */
  occurrenceLimit?: number | null;
  /** "09:00" — the local start time of each visit. */
  timeOfDay: string;
  durationMinutes: number;
};

export type GenerateOptions = {
  /** Generate visits falling on or after this date. */
  from: Date;
  /** Generate visits falling on or before this date. */
  until: Date;
  /** Dates already generated, so re-running never creates a duplicate. */
  existing?: Date[];
  /** Days nobody works, 0 = Sunday … 6 = Saturday. Defaults to Friday+Saturday. */
  weekendDays?: number[];
  /**
   * What to do when a visit lands on a non-working day.
   *   "skip"  — do not create it at all
   *   "next"  — move it to the next working day (the default)
   */
  onWeekend?: "skip" | "next";
  /** Specific dates to leave out, e.g. a public holiday or a skipped visit. */
  blockedDates?: Date[];
  /** Never produce more than this many at once. */
  maxOccurrences?: number;
};

export type Occurrence = {
  start: Date;
  end: Date;
  /** Which visit in the series this is, counting from 1. */
  index: number;
  /** True if it was nudged off a weekend. */
  movedFromWeekend: boolean;
};

/* ------------------------------- date helpers ----------------------------- */

/** Midnight on the given date, so comparisons ignore the time of day. */
export function startOfDay(date: Date): Date {
  const out = new Date(date);
  out.setHours(0, 0, 0, 0);
  return out;
}

export function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

export function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + months);
  // "The 31st, monthly" has to mean the last day in a 30-day month, not the 1st
  // of the next one.
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

/** Same calendar day? */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Applies "09:00" to a date. */
export function atTime(date: Date, timeOfDay: string): Date {
  const [hours, minutes] = timeOfDay.split(":").map(Number);
  const out = new Date(date);
  out.setHours(
    Number.isFinite(hours) ? hours : 9,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );
  return out;
}

/** Monday-agnostic: returns the first day of the week containing `date`. */
export function startOfWeek(date: Date, weekStartsOn = 0): Date {
  const out = startOfDay(date);
  const diff = (out.getDay() - weekStartsOn + 7) % 7;
  return addDays(out, -diff);
}

const DEFAULT_WEEKEND = [5, 6]; // Friday and Saturday

/* ------------------------------ the generator ----------------------------- */

/**
 * Produces the visits a rule should create between two dates.
 *
 * It never returns a visit that already exists, never returns one on a blocked
 * date, and stops at whichever comes first: the end date, the occurrence limit,
 * or the safety cap.
 */
export function generateOccurrences(
  rule: RecurrenceRule,
  options: GenerateOptions,
): Occurrence[] {
  if (rule.frequency === "ONE_OFF") {
    const start = atTime(rule.startDate, rule.timeOfDay);
    if (start < options.from || start > options.until) return [];
    if (isBlocked(start, options)) return [];
    return [{ start, end: addMinutes(start, rule.durationMinutes), index: 1, movedFromWeekend: false }];
  }

  const weekend = options.weekendDays ?? DEFAULT_WEEKEND;
  const onWeekend = options.onWeekend ?? "next";
  const maxOccurrences = options.maxOccurrences ?? 200;
  const interval = Math.max(1, rule.interval);

  const existing = new Set((options.existing ?? []).map((d) => startOfDay(d).getTime()));
  const out: Occurrence[] = [];

  // Walk the series from its very beginning so the visit numbering, and the
  // every-other-week rhythm, stay correct even when we only want a window of it.
  let index = 0;
  let cursor = startOfDay(rule.startDate);
  const hardStop = startOfDay(options.until);
  // Guard against a rule that can never advance.
  let iterations = 0;
  const ITERATION_CAP = 5000;

  while (iterations++ < ITERATION_CAP) {
    const candidates =
      rule.frequency === "MONTHLY"
        ? [cursor]
        : daysInWeekMatching(cursor, rule.daysOfWeek);

    for (const candidate of candidates) {
      if (candidate < startOfDay(rule.startDate)) continue;
      if (rule.endDate && candidate > startOfDay(rule.endDate)) return out;
      if (candidate > hardStop) return out;

      index += 1;
      if (rule.occurrenceLimit && index > rule.occurrenceLimit) return out;

      let day = candidate;
      let movedFromWeekend = false;

      if (weekend.includes(day.getDay())) {
        if (onWeekend === "skip") continue;
        // Nudge forward to the next working day.
        let guard = 0;
        while (weekend.includes(day.getDay()) && guard++ < 7) day = addDays(day, 1);
        movedFromWeekend = true;
      }

      const start = atTime(day, rule.timeOfDay);
      if (start < options.from) continue;
      if (start > options.until) return out;
      if (existing.has(startOfDay(start).getTime())) continue;
      if (isBlocked(start, options)) continue;

      out.push({
        start,
        end: addMinutes(start, rule.durationMinutes),
        index,
        movedFromWeekend,
      });
      if (out.length >= maxOccurrences) return out;
    }

    cursor =
      rule.frequency === "MONTHLY"
        ? addMonths(cursor, interval)
        : addDays(cursor, 7 * interval * (rule.frequency === "BI_WEEKLY" ? 2 : 1));
  }

  return out;
}

function isBlocked(date: Date, options: GenerateOptions): boolean {
  return (options.blockedDates ?? []).some((blocked) => isSameDay(blocked, date));
}

/** The dates in `cursor`'s week that fall on the wanted weekdays. */
function daysInWeekMatching(cursor: Date, daysOfWeek: number[]): Date[] {
  // No day chosen means "the same weekday the series started on".
  if (!daysOfWeek || daysOfWeek.length === 0) return [cursor];

  const weekStart = startOfWeek(cursor);
  return [...daysOfWeek]
    .filter((d) => d >= 0 && d <= 6)
    .sort((a, b) => a - b)
    .map((d) => addDays(weekStart, d));
}

/** A plain-English description of a rule, for showing on screen. */
export function describeRule(
  rule: Pick<RecurrenceRule, "frequency" | "interval" | "daysOfWeek" | "timeOfDay">,
  dayNames: string[],
): string {
  const days = rule.daysOfWeek?.length
    ? rule.daysOfWeek.map((d) => dayNames[d]).join(", ")
    : "";
  const every = rule.interval > 1 ? `every ${rule.interval} ` : "";

  switch (rule.frequency) {
    case "ONE_OFF":
      return `Once, at ${rule.timeOfDay}`;
    case "WEEKLY":
      return `${every ? `Every ${rule.interval} weeks` : "Weekly"}${days ? ` on ${days}` : ""} at ${rule.timeOfDay}`;
    case "BI_WEEKLY":
      return `Every 2 weeks${days ? ` on ${days}` : ""} at ${rule.timeOfDay}`;
    case "MONTHLY":
      return `${every ? `Every ${rule.interval} months` : "Monthly"} at ${rule.timeOfDay}`;
  }
}
