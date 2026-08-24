import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  documentStatus, dueComplianceAlert, staffCompliance,
  leaveBalance, leaveDays, checkLeaveRequest,
  payrollHours, wpsLine,
} from "../src/lib/hr";
import { aed } from "../src/lib/money";

const NOW = new Date("2026-06-01T09:00:00Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe("the state of one document", () => {
  test("a visa a year out is valid", () => {
    const d = documentStatus({ type: "VISA", expiresAt: inDays(365), now: NOW });
    assert.equal(d.status, "VALID");
    assert.equal(d.blocksWork, false);
  });

  test("a visa inside the warning window is expiring, but still lets them work", () => {
    const d = documentStatus({ type: "VISA", expiresAt: inDays(45), now: NOW });
    assert.equal(d.status, "EXPIRING");
    assert.equal(d.daysUntilExpiry, 45);
    assert.equal(d.blocksWork, false);
  });

  test("an expired visa stops them being sent to a job", () => {
    const d = documentStatus({ type: "VISA", expiresAt: inDays(-3), now: NOW });
    assert.equal(d.status, "EXPIRED");
    assert.equal(d.daysUntilExpiry, -3);
    assert.equal(d.blocksWork, true);
  });

  test("expiring today is not yet expired", () => {
    const d = documentStatus({ type: "VISA", expiresAt: NOW, now: NOW });
    assert.equal(d.daysUntilExpiry, 0);
    assert.equal(d.status, "EXPIRING");
    assert.equal(d.blocksWork, false);
  });

  test("the time of day never turns a valid document into an expired one", () => {
    const lateInTheDay = new Date("2026-06-01T23:30:00Z");
    const d = documentStatus({ type: "VISA", expiresAt: new Date("2026-06-01T00:01:00Z"), now: lateInTheDay });
    assert.equal(d.status, "EXPIRING");
  });

  test("an expired training certificate is a quality problem, not a legal one", () => {
    const d = documentStatus({ type: "TRAINING_CERT", expiresAt: inDays(-10), now: NOW });
    assert.equal(d.status, "EXPIRED");
    assert.equal(d.blocksWork, false);
  });

  test("a visa with no expiry recorded is flagged as missing", () => {
    const d = documentStatus({ type: "VISA", expiresAt: null, now: NOW });
    assert.equal(d.status, "MISSING");
    assert.equal(d.daysUntilExpiry, null);
  });

  test("a passport with no expiry is not treated as a problem", () => {
    assert.equal(documentStatus({ type: "PASSPORT", expiresAt: null, now: NOW }).status, "VALID");
  });

  test("a wider warning window catches it earlier", () => {
    assert.equal(
      documentStatus({ type: "VISA", expiresAt: inDays(80), now: NOW, warnWithinDays: 90 }).status,
      "EXPIRING",
    );
  });
});

describe("which expiry warning is due", () => {
  const OFFSETS = [60, 30, 7];

  test("nothing is due while it is far away", () => {
    assert.equal(dueComplianceAlert({ daysUntilExpiry: 90, offsetsDays: OFFSETS, alreadySent: [] }), null);
  });

  test("the 60-day warning fires first", () => {
    assert.equal(dueComplianceAlert({ daysUntilExpiry: 60, offsetsDays: OFFSETS, alreadySent: [] }), 60);
  });

  test("once 60 is sent, 30 is next", () => {
    assert.equal(dueComplianceAlert({ daysUntilExpiry: 29, offsetsDays: OFFSETS, alreadySent: [60] }), 30);
  });

  test("a document entered late sends ONE warning, not all three at once", () => {
    // 20 days out, nothing sent: 60 and 30 have both been passed, but only the
    // largest unsent one goes now.
    assert.equal(dueComplianceAlert({ daysUntilExpiry: 20, offsetsDays: OFFSETS, alreadySent: [] }), 60);
  });

  test("nothing is sent twice", () => {
    assert.equal(
      dueComplianceAlert({ daysUntilExpiry: 5, offsetsDays: OFFSETS, alreadySent: [60, 30, 7] }),
      null,
    );
  });

  test("an already-expired document still chases the unsent warnings", () => {
    assert.equal(dueComplianceAlert({ daysUntilExpiry: -5, offsetsDays: OFFSETS, alreadySent: [60, 30] }), 7);
  });

  test("no expiry date means no warning", () => {
    assert.equal(dueComplianceAlert({ daysUntilExpiry: null, offsetsDays: OFFSETS, alreadySent: [] }), null);
  });
});

describe("one person's overall document position", () => {
  const valid = documentStatus({ type: "VISA", expiresAt: inDays(300), now: NOW });
  const expiring = documentStatus({ type: "EMIRATES_ID", expiresAt: inDays(20), now: NOW });
  const expired = documentStatus({ type: "LABOUR_CARD", expiresAt: inDays(-1), now: NOW });

  test("all valid is valid", () => {
    const s = staffCompliance([valid, valid]);
    assert.equal(s.status, "VALID");
    assert.equal(s.blockedFromWork, false);
  });

  test("one expiring document colours the whole person", () => {
    assert.equal(staffCompliance([valid, expiring]).status, "EXPIRING");
  });

  test("one expired blocking document stops them working", () => {
    const s = staffCompliance([valid, expiring, expired]);
    assert.equal(s.status, "EXPIRED");
    assert.equal(s.blockedFromWork, true);
    assert.equal(s.expiredCount, 1);
    assert.equal(s.expiringCount, 1);
  });

  test("the soonest expiry is what the list sorts on", () => {
    assert.equal(staffCompliance([valid, expiring]).soonestDays, 20);
  });

  test("somebody with no documents at all is not silently fine", () => {
    const s = staffCompliance([documentStatus({ type: "VISA", expiresAt: null, now: NOW })]);
    assert.equal(s.status, "MISSING");
    assert.equal(s.missingCount, 1);
  });
});

describe("annual leave balance", () => {
  test("nothing taken leaves the full entitlement", () => {
    const b = leaveBalance({ entitlementDays: 30, requests: [] });
    assert.equal(b.remainingDays, 30);
  });

  test("approved leave is taken, pending leave is held back", () => {
    const b = leaveBalance({
      entitlementDays: 30,
      requests: [
        { type: "ANNUAL", days: 10, status: "APPROVED" },
        { type: "ANNUAL", days: 5, status: "PENDING" },
      ],
    });
    assert.equal(b.takenDays, 10);
    assert.equal(b.bookedDays, 5);
    assert.equal(b.remainingDays, 15);
  });

  test("sick leave does not come off the annual entitlement", () => {
    const b = leaveBalance({
      entitlementDays: 30,
      requests: [{ type: "SICK", days: 6, status: "APPROVED" }],
    });
    assert.equal(b.remainingDays, 30);
  });

  test("a rejected request gives the days back", () => {
    const b = leaveBalance({
      entitlementDays: 30,
      requests: [{ type: "ANNUAL", days: 8, status: "REJECTED" }],
    });
    assert.equal(b.remainingDays, 30);
  });
});

describe("counting leave days", () => {
  test("a single day is one day, not zero", () => {
    assert.equal(leaveDays(new Date("2026-06-01"), new Date("2026-06-01")), 1);
  });

  test("both end days are included", () => {
    assert.equal(leaveDays(new Date("2026-06-01"), new Date("2026-06-05")), 5);
  });

  test("backwards dates are zero, never negative", () => {
    assert.equal(leaveDays(new Date("2026-06-05"), new Date("2026-06-01")), 0);
  });
});

const CLEAN_REQUEST = {
  startDate: new Date("2026-07-01"),
  endDate: new Date("2026-07-05"),
  type: "ANNUAL",
  isEmployed: true,
  balance: { entitlementDays: 30, takenDays: 0, bookedDays: 0, remainingDays: 30 },
  overlapsExisting: false,
  jobsInPeriod: 0,
  coverageShortfalls: [],
};

describe("booking leave", () => {
  test("a straightforward request is allowed with nothing to flag", () => {
    const r = checkLeaveRequest(CLEAN_REQUEST);
    assert.equal(r.allowed, true);
    assert.deepEqual(r.warnings, []);
  });

  test("overlapping their own existing leave is refused outright", () => {
    const r = checkLeaveRequest({ ...CLEAN_REQUEST, overlapsExisting: true });
    assert.equal(r.allowed, false);
    assert.equal(r.allowed === false && r.reason, "OVERLAPS_EXISTING");
  });

  test("backwards dates are refused", () => {
    const r = checkLeaveRequest({
      ...CLEAN_REQUEST,
      startDate: new Date("2026-07-10"),
      endDate: new Date("2026-07-01"),
    });
    assert.equal(r.allowed === false && r.reason, "BACKWARDS_DATES");
  });

  test("somebody who has left cannot book leave", () => {
    const r = checkLeaveRequest({ ...CLEAN_REQUEST, isEmployed: false });
    assert.equal(r.allowed === false && r.reason, "NOT_EMPLOYED");
  });

  test("going over the balance WARNS but does not refuse — that is the owner's call", () => {
    const r = checkLeaveRequest({
      ...CLEAN_REQUEST,
      balance: { entitlementDays: 30, takenDays: 28, bookedDays: 0, remainingDays: 2 },
    });
    assert.equal(r.allowed, true);
    assert.equal(r.warnings[0].kind, "EXCEEDS_BALANCE");
  });

  test("unpaid leave is never measured against the annual balance", () => {
    const r = checkLeaveRequest({
      ...CLEAN_REQUEST,
      type: "UNPAID",
      balance: { entitlementDays: 30, takenDays: 30, bookedDays: 0, remainingDays: 0 },
    });
    assert.equal(r.warnings.some((w) => w.kind === "EXCEEDS_BALANCE"), false);
  });

  test("jobs already booked in that week are flagged", () => {
    const r = checkLeaveRequest({ ...CLEAN_REQUEST, jobsInPeriod: 4 });
    assert.equal(r.allowed, true);
    assert.deepEqual(r.warnings[0], { kind: "JOBS_SCHEDULED", jobCount: 4 });
  });

  test("a day the team would be left short is named", () => {
    const r = checkLeaveRequest({
      ...CLEAN_REQUEST,
      coverageShortfalls: [{ date: "2026-07-02", remainingCleaners: 1 }],
    });
    const warning = r.warnings.find((w) => w.kind === "TEAM_LEFT_SHORT");
    assert.ok(warning && warning.kind === "TEAM_LEFT_SHORT" && warning.date === "2026-07-02");
  });

  test("a refusal still reports the warnings, so the screen can explain itself", () => {
    const r = checkLeaveRequest({ ...CLEAN_REQUEST, overlapsExisting: true, jobsInPeriod: 3 });
    assert.equal(r.allowed, false);
    assert.equal(r.warnings.length, 1);
  });
});

describe("adding up a timesheet", () => {
  test("clean entries are payable", () => {
    const p = payrollHours([
      { minutesWorked: 120, reviewStatus: "NOT_REQUIRED", flagged: false },
      { minutesWorked: 240, reviewStatus: "NOT_REQUIRED", flagged: false },
    ]);
    assert.equal(p.payableHours, 6);
    assert.equal(p.entriesAwaitingReview, 0);
  });

  test("time waiting for review is NOT payable yet", () => {
    const p = payrollHours([
      { minutesWorked: 120, reviewStatus: "NOT_REQUIRED", flagged: false },
      { minutesWorked: 180, reviewStatus: "PENDING", flagged: true },
    ]);
    assert.equal(p.payableHours, 2);
    assert.equal(p.pendingMinutes, 180);
    assert.equal(p.entriesAwaitingReview, 1);
  });

  test("approving flagged time makes it payable", () => {
    const p = payrollHours([{ minutesWorked: 180, reviewStatus: "APPROVED", flagged: true }]);
    assert.equal(p.payableHours, 3);
  });

  test("rejected time is never paid", () => {
    const p = payrollHours([{ minutesWorked: 180, reviewStatus: "REJECTED", flagged: true }]);
    assert.equal(p.payableHours, 0);
    assert.equal(p.rejectedMinutes, 180);
  });

  test("a nonsense negative entry cannot reduce the total", () => {
    const p = payrollHours([
      { minutesWorked: 120, reviewStatus: "APPROVED", flagged: false },
      { minutesWorked: -60, reviewStatus: "APPROVED", flagged: false },
    ]);
    assert.equal(p.payableHours, 2);
  });
});

describe("the WPS pay line", () => {
  const BASE = {
    employeeNo: "EMP-0001",
    fullName: "Ahmed Hassan",
    iban: "AE070331234567890123456",
    labourCardNo: "12345678",
    basicSalaryFils: aed(2500),
    allowancesFils: aed(500),
    unpaidLeaveDays: 0,
    daysInMonth: 30,
  };

  test("basic plus allowances, nothing deducted", () => {
    const line = wpsLine(BASE);
    assert.equal(line.totalFils, aed(3000));
    assert.equal(line.deductionsFils, 0);
    assert.equal(line.problem, null);
  });

  test("unpaid leave is deducted at the daily rate of the whole package", () => {
    const line = wpsLine({ ...BASE, unpaidLeaveDays: 3 });
    assert.equal(line.deductionsFils, aed(300)); // 3000 / 30 = 100 a day
    assert.equal(line.totalFils, aed(2700));
  });

  test("a deduction can never exceed the salary", () => {
    const line = wpsLine({ ...BASE, unpaidLeaveDays: 90 });
    assert.equal(line.totalFils, 0);
    assert.equal(line.deductionsFils, aed(3000));
  });

  test("somebody with no IBAN is listed WITH the reason, not dropped", () => {
    const line = wpsLine({ ...BASE, iban: null });
    assert.equal(line.totalFils, aed(3000));
    assert.match(line.problem ?? "", /IBAN/);
  });

  test("both missing details are named", () => {
    const line = wpsLine({ ...BASE, iban: null, labourCardNo: null });
    assert.match(line.problem ?? "", /IBAN and labour card number/);
  });

  test("a zero salary is reported as a problem rather than paid as zero", () => {
    const line = wpsLine({ ...BASE, basicSalaryFils: 0, allowancesFils: 0 });
    assert.match(line.problem ?? "", /salary/);
  });
});
