import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  generateOccurrences, addMonths, addDays, atTime, startOfWeek, describeRule,
  type RecurrenceRule,
} from "../src/lib/recurrence";

/** A Sunday, so the weekday maths is easy to reason about. */
const SUNDAY = new Date(2026, 0, 4); // 4 Jan 2026 is a Sunday
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const iso = (date: Date) => date.toISOString().slice(0, 10);

const weekly: RecurrenceRule = {
  frequency: "WEEKLY",
  interval: 1,
  daysOfWeek: [2], // Tuesday
  startDate: SUNDAY,
  timeOfDay: "09:00",
  durationMinutes: 120,
};

describe("weekly series", () => {
  test("produces one visit a week on the chosen day", () => {
    const out = generateOccurrences(weekly, { from: SUNDAY, until: d(2026, 2, 1) });
    assert.equal(out.length, 4);
    for (const o of out) assert.equal(o.start.getDay(), 2, "every visit lands on a Tuesday");
    assert.deepEqual(out.map((o) => iso(o.start)), ["2026-01-06", "2026-01-13", "2026-01-20", "2026-01-27"]);
  });

  test("applies the time of day", () => {
    const [first] = generateOccurrences(weekly, { from: SUNDAY, until: d(2026, 1, 10) });
    assert.equal(first.start.getHours(), 9);
    assert.equal(first.start.getMinutes(), 0);
    assert.equal(first.end.getTime() - first.start.getTime(), 120 * 60_000);
  });

  test("can run on several days a week", () => {
    const out = generateOccurrences(
      { ...weekly, daysOfWeek: [0, 2, 4] },
      { from: SUNDAY, until: d(2026, 1, 17) },
    );
    assert.deepEqual(out.map((o) => o.start.getDay()), [0, 2, 4, 0, 2, 4]);
  });

  test("stops at the end date", () => {
    const out = generateOccurrences(
      { ...weekly, endDate: d(2026, 1, 20) },
      { from: SUNDAY, until: d(2026, 3, 1) },
    );
    assert.deepEqual(out.map((o) => iso(o.start)), ["2026-01-06", "2026-01-13", "2026-01-20"]);
  });

  test("stops after the occurrence limit", () => {
    const out = generateOccurrences(
      { ...weekly, occurrenceLimit: 2 },
      { from: SUNDAY, until: d(2026, 6, 1) },
    );
    assert.equal(out.length, 2);
  });

  test("numbers the visits from the start of the series, not the window", () => {
    // Ask only for February, but visit numbering must continue from January.
    const out = generateOccurrences(weekly, { from: d(2026, 2, 1), until: d(2026, 2, 28) });
    assert.ok(out[0].index > 4, `expected a later index, got ${out[0].index}`);
  });
});

describe("every-other-week series", () => {
  test("skips a week between visits", () => {
    const out = generateOccurrences(
      { ...weekly, frequency: "BI_WEEKLY" },
      { from: SUNDAY, until: d(2026, 3, 1) },
    );
    assert.deepEqual(out.map((o) => iso(o.start)), ["2026-01-06", "2026-01-20", "2026-02-03", "2026-02-17"]);
  });
});

describe("monthly series", () => {
  test("lands on the same date each month", () => {
    const out = generateOccurrences(
      { ...weekly, frequency: "MONTHLY", daysOfWeek: [], startDate: d(2026, 1, 12) },
      { from: d(2026, 1, 1), until: d(2026, 4, 30) },
    );
    // 12 April 2026 is a Sunday, which is a working day here, so it stays put.
    assert.deepEqual(out.map((o) => iso(o.start)), ["2026-01-12", "2026-02-12", "2026-03-12", "2026-04-12"]);
  });

  test("the 31st becomes the last day of a shorter month, not the 1st of the next", () => {
    // This is the classic monthly-recurrence bug.
    assert.equal(iso(addMonths(d(2026, 1, 31), 1)), "2026-02-28");
    assert.equal(iso(addMonths(d(2026, 3, 31), 1)), "2026-04-30");
  });
});

describe("weekends", () => {
  test("a visit landing on Friday is moved to the next working day", () => {
    // 2 Jan 2026 is a Friday.
    const out = generateOccurrences(
      { ...weekly, daysOfWeek: [5], startDate: d(2026, 1, 1) },
      { from: d(2026, 1, 1), until: d(2026, 1, 10), weekendDays: [5, 6] },
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].start.getDay(), 0, "moved to Sunday");
    assert.equal(out[0].movedFromWeekend, true);
  });

  test("with onWeekend=skip it is dropped instead", () => {
    const out = generateOccurrences(
      { ...weekly, daysOfWeek: [5], startDate: d(2026, 1, 1) },
      { from: d(2026, 1, 1), until: d(2026, 1, 10), weekendDays: [5, 6], onWeekend: "skip" },
    );
    assert.equal(out.length, 0);
  });

  test("a Saturday-Sunday weekend is handled just as well", () => {
    const out = generateOccurrences(
      { ...weekly, daysOfWeek: [0], startDate: d(2026, 1, 1) },
      { from: d(2026, 1, 1), until: d(2026, 1, 10), weekendDays: [6, 0] },
    );
    assert.equal(out[0].start.getDay(), 1, "Sunday visit moved to Monday");
  });
});

describe("not creating duplicates", () => {
  test("visits that already exist are not produced again", () => {
    const first = generateOccurrences(weekly, { from: SUNDAY, until: d(2026, 2, 1) });
    const second = generateOccurrences(weekly, {
      from: SUNDAY,
      until: d(2026, 2, 1),
      existing: first.map((o) => o.start),
    });
    assert.equal(second.length, 0, "re-running the generator creates nothing new");
  });

  test("a skipped visit is not recreated on the next run", () => {
    const skipped = d(2026, 1, 13);
    const out = generateOccurrences(weekly, {
      from: SUNDAY, until: d(2026, 2, 1), blockedDates: [skipped],
    });
    assert.equal(out.some((o) => iso(o.start) === "2026-01-13"), false);
    assert.equal(out.length, 3, "the rest of the series is untouched");
  });
});

describe("one-off bookings", () => {
  test("produce exactly one visit", () => {
    const out = generateOccurrences(
      { ...weekly, frequency: "ONE_OFF", startDate: d(2026, 1, 8) },
      { from: d(2026, 1, 1), until: d(2026, 12, 31) },
    );
    assert.equal(out.length, 1);
    assert.equal(iso(out[0].start), "2026-01-08");
  });

  test("produce nothing outside the window", () => {
    const out = generateOccurrences(
      { ...weekly, frequency: "ONE_OFF", startDate: d(2026, 1, 8) },
      { from: d(2026, 2, 1), until: d(2026, 3, 1) },
    );
    assert.equal(out.length, 0);
  });
});

describe("safety", () => {
  test("never returns more than the cap, even for an endless rule", () => {
    const out = generateOccurrences(weekly, {
      from: SUNDAY, until: d(2050, 1, 1), maxOccurrences: 10,
    });
    assert.equal(out.length, 10);
  });

  test("an empty days-of-week list falls back to the start day, not an infinite loop", () => {
    const out = generateOccurrences(
      { ...weekly, daysOfWeek: [] },
      { from: SUNDAY, until: d(2026, 2, 1) },
    );
    assert.ok(out.length > 0 && out.length <= 5);
  });
});

describe("helpers", () => {
  test("startOfWeek returns the Sunday", () => {
    assert.equal(startOfWeek(d(2026, 1, 8)).getDay(), 0);
  });
  test("atTime parses HH:mm", () => {
    const out = atTime(d(2026, 1, 8), "14:30");
    assert.equal(out.getHours(), 14);
    assert.equal(out.getMinutes(), 30);
  });
  test("addDays crosses a month boundary", () => {
    assert.equal(iso(addDays(d(2026, 1, 30), 3)), "2026-02-02");
  });
  test("describeRule reads like English", () => {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    assert.match(describeRule(weekly, names), /Weekly on Tue at 09:00/);
  });
});
