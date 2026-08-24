import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  findConflicts, blockingConflicts, utilisationFor, assessCancellation,
  canClientReschedule, occupiesSlot,
  type ScheduledJob, type TeamRules,
} from "../src/lib/scheduling";
import { aed } from "../src/lib/money";

const MARINA = "zone-marina";
const MIRDIF = "zone-mirdif";
const JLT = "zone-jlt";

/** Marina→Mirdif is the long cross-city run; Marina→JLT is next door. */
const travel = (from: string, to: string): number | null => {
  if (from === to) return 10;
  const pair = [from, to].sort().join("|");
  if (pair === [MARINA, MIRDIF].sort().join("|")) return 45;
  if (pair === [MARINA, JLT].sort().join("|")) return 20;
  return null; // no figure for this pair
};

const team: TeamRules = {
  id: "team-alpha",
  capacityMinutesPerDay: 480,
  workingDays: [0, 1, 2, 3, 4], // Sunday–Thursday
  shiftStart: "08:00",
  shiftEnd: "18:00",
};

const at = (h: number, m = 0) => new Date(2026, 0, 5, h, m); // a Monday
const job = (over: Partial<ScheduledJob> = {}): ScheduledJob => ({
  id: "j1", teamId: team.id, start: at(9), end: at(11), zoneId: MARINA,
  jobNo: "JOB-1", status: "SCHEDULED", durationMinutes: 120, ...over,
});

describe("double booking", () => {
  test("two overlapping jobs on one team is a blocking conflict", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW" }),
      teamJobs: [job({ id: "existing", jobNo: "JOB-9", start: at(10), end: at(12) })],
      team, travelMinutes: travel,
    });
    const blocking = blockingConflicts(conflicts);
    assert.equal(blocking.length, 1);
    assert.equal(blocking[0].code, "DOUBLE_BOOKED");
    assert.equal(blocking[0].detail.jobNo, "JOB-9");
  });

  test("back-to-back jobs in the same zone do not overlap", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(11), end: at(13) }),
      teamJobs: [job({ id: "existing", jobNo: "JOB-9", start: at(9), end: at(11) })],
      team, travelMinutes: travel,
    });
    assert.equal(blockingConflicts(conflicts).length, 0);
  });

  test("a cancelled job does not block the slot", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW" }),
      teamJobs: [job({ id: "existing", jobNo: "JOB-9", status: "CANCELLED" })],
      team, travelMinutes: travel,
    });
    assert.equal(blockingConflicts(conflicts).length, 0);
  });

  test("a job on a DIFFERENT team is irrelevant", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW" }),
      teamJobs: [], // the caller only passes this team's jobs
      team, travelMinutes: travel,
    });
    assert.equal(blockingConflicts(conflicts).length, 0);
  });
});

describe("travel time between zones", () => {
  test("Marina at 09:00-11:00 then Mirdif at 11:00 is flagged", () => {
    // 0 minutes to cross Dubai is not realistic; 45 are needed.
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(11), end: at(13), zoneId: MIRDIF }),
      teamJobs: [job({ id: "prev", jobNo: "JOB-PREV", start: at(9), end: at(11), zoneId: MARINA })],
      team, travelMinutes: travel,
    });
    const travelConflict = conflicts.find((c) => c.code === "TRAVEL_TIME");
    assert.ok(travelConflict, "expected a travel-time warning");
    assert.equal(travelConflict.severity, "WARN", "a warning, not a block — the manager decides");
    assert.equal(travelConflict.detail.gapMinutes, 0);
    assert.equal(travelConflict.detail.driveMinutes, 45);
  });

  test("leaving a 60-minute gap for a 45-minute drive is fine", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(12), end: at(14), zoneId: MIRDIF }),
      teamJobs: [job({ id: "prev", jobNo: "JOB-PREV", start: at(9), end: at(11), zoneId: MARINA })],
      team, travelMinutes: travel,
    });
    assert.equal(conflicts.some((c) => c.code === "TRAVEL_TIME"), false);
  });

  test("the buffer for parking and lifts is respected", () => {
    // 45 drive + 20 buffer = 65 needed, but only 60 available.
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(12), end: at(14), zoneId: MIRDIF }),
      teamJobs: [job({ id: "prev", jobNo: "JOB-PREV", start: at(9), end: at(11), zoneId: MARINA })],
      team, travelMinutes: travel, travelBufferMinutes: 20,
    });
    const c = conflicts.find((x) => x.code === "TRAVEL_TIME");
    assert.ok(c);
    assert.equal(c.detail.neededMinutes, 65);
  });

  test("the job AFTER the candidate is checked too", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(9), end: at(11), zoneId: MARINA }),
      teamJobs: [job({ id: "next", jobNo: "JOB-NEXT", start: at(11), end: at(13), zoneId: MIRDIF })],
      team, travelMinutes: travel,
    });
    assert.ok(conflicts.some((c) => c.code === "TRAVEL_TIME"));
  });

  test("no figure for a pair of zones means no false warning", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(11), end: at(13), zoneId: JLT }),
      teamJobs: [job({ id: "prev", jobNo: "JOB-PREV", start: at(9), end: at(11), zoneId: MIRDIF })],
      team, travelMinutes: travel,
    });
    assert.equal(conflicts.some((c) => c.code === "TRAVEL_TIME"), false);
  });

  test("yesterday's job does not affect today's travel", () => {
    const yesterday = new Date(2026, 0, 4, 16, 0);
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(9), end: at(11), zoneId: MIRDIF }),
      teamJobs: [job({
        id: "prev", jobNo: "JOB-PREV", zoneId: MARINA,
        start: yesterday, end: new Date(2026, 0, 4, 18, 0),
      })],
      team, travelMinutes: travel,
    });
    assert.equal(conflicts.some((c) => c.code === "TRAVEL_TIME"), false);
  });
});

describe("shift and capacity warnings", () => {
  test("a job starting before the shift is flagged", () => {
    const conflicts = findConflicts({
      candidate: job({ start: at(6), end: at(8) }), teamJobs: [], team, travelMinutes: travel,
    });
    assert.ok(conflicts.some((c) => c.code === "OUTSIDE_SHIFT"));
  });

  test("a job running past the end of the shift is flagged", () => {
    const conflicts = findConflicts({
      candidate: job({ start: at(17), end: at(20) }), teamJobs: [], team, travelMinutes: travel,
    });
    assert.ok(conflicts.some((c) => c.code === "OUTSIDE_SHIFT"));
  });

  test("booking a team on their day off is flagged", () => {
    const friday = new Date(2026, 0, 9, 9, 0); // Friday
    const conflicts = findConflicts({
      candidate: job({ start: friday, end: new Date(2026, 0, 9, 11, 0) }),
      teamJobs: [], team, travelMinutes: travel,
    });
    assert.ok(conflicts.some((c) => c.code === "NON_WORKING_DAY"));
  });

  test("going over the day's sellable minutes is flagged with the overage", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(14), end: at(18), durationMinutes: 240 }),
      teamJobs: [job({ id: "a", jobNo: "JOB-A", start: at(8), end: at(13), durationMinutes: 300 })],
      team, travelMinutes: travel,
    });
    const c = conflicts.find((x) => x.code === "OVER_CAPACITY");
    assert.ok(c);
    assert.equal(c.detail.bookedMinutes, 540);
    assert.equal(c.detail.capacityMinutes, 480);
    assert.equal(c.detail.overBy, 60);
  });

  test("a team on leave that day is flagged", () => {
    const conflicts = findConflicts({
      candidate: job(), teamJobs: [], team, travelMinutes: travel,
      teamUnavailableDates: [at(0)],
    });
    assert.ok(conflicts.some((c) => c.code === "TEAM_ON_LEAVE"));
  });

  test("blocking problems are listed before warnings", () => {
    const conflicts = findConflicts({
      candidate: job({ id: "new", jobNo: "JOB-NEW", start: at(6), end: at(9) }),
      teamJobs: [job({ id: "x", jobNo: "JOB-X", start: at(8), end: at(10) })],
      team, travelMinutes: travel,
    });
    assert.equal(conflicts[0].severity, "BLOCK");
  });
});

describe("utilisation", () => {
  test("capacity sold divided by capacity available", () => {
    const jobs = [
      job({ id: "a", start: at(8), end: at(12), durationMinutes: 240 }),
      job({ id: "b", start: at(13), end: at(15), durationMinutes: 120 }),
    ];
    const [row] = utilisationFor(jobs, [team], [at(0)]);
    assert.equal(row.bookedMinutes, 360);
    assert.equal(row.capacityMinutes, 480);
    assert.equal(row.percent, 75);
    assert.equal(row.jobCount, 2);
  });

  test("a non-working day has no capacity and reports 0%, not infinity", () => {
    const friday = new Date(2026, 0, 9);
    const [row] = utilisationFor([], [team], [friday]);
    assert.equal(row.capacityMinutes, 0);
    assert.equal(row.percent, 0);
    assert.equal(Number.isFinite(row.percent), true);
  });

  test("cancelled jobs do not count as sold capacity", () => {
    const [row] = utilisationFor(
      [job({ status: "CANCELLED", durationMinutes: 480 })], [team], [at(0)],
    );
    assert.equal(row.bookedMinutes, 0);
  });

  test("an over-booked day reports above 100%, honestly", () => {
    const [row] = utilisationFor(
      [job({ durationMinutes: 600 })], [team], [at(0)],
    );
    assert.equal(row.percent, 125);
  });
});

describe("cancellation policy", () => {
  const policy = { cutoffHours: 24, feeBps: 5000, feeFlatFils: 0 };
  const now = new Date(2026, 0, 5, 9, 0);

  test("cancelling with more than 24 hours' notice is free", () => {
    const out = assessCancellation({
      jobStart: new Date(2026, 0, 7, 9, 0), now, jobPriceFils: aed(300), policy,
    });
    assert.equal(out.isLate, false);
    assert.equal(out.feeFils, 0);
  });

  test("cancelling inside the cutoff charges the percentage fee", () => {
    const out = assessCancellation({
      jobStart: new Date(2026, 0, 5, 20, 0), now, jobPriceFils: aed(300), policy,
    });
    assert.equal(out.isLate, true);
    assert.equal(out.feeFils, aed(150)); // 50% of 300
  });

  test("a flat fee can be charged as well as a percentage", () => {
    const out = assessCancellation({
      jobStart: new Date(2026, 0, 5, 20, 0), now, jobPriceFils: aed(300),
      policy: { cutoffHours: 24, feeBps: 2500, feeFlatFils: aed(25) },
    });
    assert.equal(out.feeFils, aed(100)); // 75 + 25
  });

  test("the fee can never exceed the price of the job", () => {
    const out = assessCancellation({
      jobStart: new Date(2026, 0, 5, 20, 0), now, jobPriceFils: aed(100),
      policy: { cutoffHours: 24, feeBps: 10000, feeFlatFils: aed(500) },
    });
    assert.equal(out.feeFils, aed(100));
  });

  test("with fees switched off, a late cancellation still costs nothing", () => {
    // This is the founder's current setting.
    const out = assessCancellation({
      jobStart: new Date(2026, 0, 5, 20, 0), now, jobPriceFils: aed(300),
      policy: { cutoffHours: 24, feeBps: 0, feeFlatFils: 0 },
    });
    assert.equal(out.isLate, true, "still recorded as late");
    assert.equal(out.feeFils, 0, "but nothing is charged");
  });

  test("cancelling after the job should have started is marked as such", () => {
    const out = assessCancellation({
      jobStart: new Date(2026, 0, 5, 8, 0), now, jobPriceFils: aed(300), policy,
    });
    assert.equal(out.reason, "ALREADY_STARTED");
  });
});

describe("client self-service rescheduling", () => {
  const now = new Date(2026, 0, 5, 9, 0);

  test("allowed with more than 24 hours' notice", () => {
    const out = canClientReschedule({
      jobStart: new Date(2026, 0, 7, 9, 0), now, status: "SCHEDULED", cutoffHours: 24,
    });
    assert.equal(out.allowed, true);
  });

  test("refused inside the cutoff", () => {
    const out = canClientReschedule({
      jobStart: new Date(2026, 0, 5, 20, 0), now, status: "SCHEDULED", cutoffHours: 24,
    });
    assert.equal(out.allowed, false);
    assert.equal(out.reason, "TOO_LATE");
  });

  test("refused once the team is on their way", () => {
    const out = canClientReschedule({
      jobStart: new Date(2026, 0, 7, 9, 0), now, status: "EN_ROUTE", cutoffHours: 24,
    });
    assert.equal(out.allowed, false);
    assert.equal(out.reason, "WRONG_STATUS");
  });
});

describe("which statuses take up a slot", () => {
  test("scheduled, en route, in progress and completed do", () => {
    for (const s of ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"]) {
      assert.equal(occupiesSlot(s), true, s);
    }
  });
  test("cancelled and no-access do not", () => {
    assert.equal(occupiesSlot("CANCELLED"), false);
    assert.equal(occupiesSlot("NO_ACCESS"), false);
  });
});
