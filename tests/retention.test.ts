import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  ratingOutcome, ratingRequestDueAt, averageStars,
  npsBucket, npsSummary, quarterOf, npsDue,
  assessRisk, worstRiskScore, winbackEligible,
  referralRewardFils, referralQualifies,
} from "../src/lib/retention";
import { aed } from "../src/lib/money";

const THRESHOLDS = { churnSkippedCycles: 2, winbackInactiveDays: 60 };

describe("what happens after a rating", () => {
  test("five stars asks for a public review and opens nothing", () => {
    const out = ratingOutcome(5, 4);
    assert.equal(out.askForGoogleReview, true);
    assert.equal(out.opensTicket, false);
    assert.equal(out.severity, "LOW");
  });

  test("four stars is fine when the threshold is four", () => {
    assert.equal(ratingOutcome(4, 4).opensTicket, false);
  });

  test("three stars opens a ticket when the threshold is four", () => {
    const out = ratingOutcome(3, 4);
    assert.equal(out.opensTicket, true);
    assert.equal(out.severity, "MEDIUM");
  });

  test("one star is critical, not merely bad", () => {
    assert.equal(ratingOutcome(1, 4).severity, "CRITICAL");
  });

  test("two stars is high", () => {
    assert.equal(ratingOutcome(2, 4).severity, "HIGH");
  });

  test("raising the threshold opens tickets on more ratings", () => {
    assert.equal(ratingOutcome(4, 5).opensTicket, true);
  });
});

describe("when the rating request goes out", () => {
  test("the delay is added to the end of the job", () => {
    const end = new Date("2026-03-01T10:00:00Z");
    assert.equal(ratingRequestDueAt(end, 120).toISOString(), "2026-03-01T12:00:00.000Z");
  });

  test("a nonsense negative delay does not send it before the job ended", () => {
    const end = new Date("2026-03-01T10:00:00Z");
    assert.equal(ratingRequestDueAt(end, -60).getTime(), end.getTime());
  });
});

describe("average stars", () => {
  test("no ratings is null, not zero", () => {
    assert.equal(averageStars([]), null);
  });

  test("rounded to one decimal place", () => {
    assert.equal(averageStars([{ stars: 5 }, { stars: 4 }, { stars: 4 }]), 4.3);
  });
});

describe("net promoter score", () => {
  test("the three bands", () => {
    assert.equal(npsBucket(10), "PROMOTER");
    assert.equal(npsBucket(9), "PROMOTER");
    assert.equal(npsBucket(8), "PASSIVE");
    assert.equal(npsBucket(7), "PASSIVE");
    assert.equal(npsBucket(6), "DETRACTOR");
    assert.equal(npsBucket(0), "DETRACTOR");
  });

  test("promoters minus detractors, as a percentage", () => {
    const s = npsSummary([{ score: 10 }, { score: 9 }, { score: 8 }, { score: 3 }]);
    assert.equal(s.responses, 4);
    assert.equal(s.promoters, 2);
    assert.equal(s.passives, 1);
    assert.equal(s.detractors, 1);
    assert.equal(s.score, 25); // (2 - 1) / 4
  });

  test("passives drag the score down without being counted against you", () => {
    assert.equal(npsSummary([{ score: 10 }, { score: 8 }]).score, 50);
  });

  test("all detractors is minus one hundred", () => {
    assert.equal(npsSummary([{ score: 1 }, { score: 6 }]).score, -100);
  });

  test("unanswered surveys are ignored, and nobody answering is null", () => {
    assert.equal(npsSummary([{ score: null }, { score: null }]).score, null);
    assert.equal(npsSummary([{ score: null }, { score: 10 }]).responses, 1);
  });
});

describe("which quarter, and whether a survey is due", () => {
  test("quarters run January-March, April-June and so on", () => {
    assert.equal(quarterOf(new Date("2026-01-01T00:00:00Z")), "2026-Q1");
    assert.equal(quarterOf(new Date("2026-03-31T23:59:59Z")), "2026-Q1");
    assert.equal(quarterOf(new Date("2026-04-01T00:00:00Z")), "2026-Q2");
    assert.equal(quarterOf(new Date("2026-12-31T00:00:00Z")), "2026-Q4");
  });

  test("never surveyed before means it is due", () => {
    assert.equal(npsDue({
      lastSentAt: null, intervalDays: 90,
      now: new Date("2026-05-01T00:00:00Z"), quartersAlreadySent: [],
    }), true);
  });

  test("never twice in the same quarter, even after the interval", () => {
    assert.equal(npsDue({
      lastSentAt: new Date("2026-01-02T00:00:00Z"), intervalDays: 90,
      now: new Date("2026-05-01T00:00:00Z"), quartersAlreadySent: ["2026-Q2"],
    }), false);
  });

  test("not due until the interval has passed", () => {
    assert.equal(npsDue({
      lastSentAt: new Date("2026-04-10T00:00:00Z"), intervalDays: 90,
      now: new Date("2026-05-01T00:00:00Z"), quartersAlreadySent: [],
    }), false);
  });
});

const HEALTHY = {
  daysSinceLastJob: 7,
  skippedCycles: 0,
  recentAverageStars: 4.8,
  earlierAverageStars: 4.7,
  overdueInvoices: 0,
  worstDaysOverdue: 0,
  recentComplaints: 0,
  isRecurring: true,
};

describe("who looks like they are leaving", () => {
  test("a happy, paying, active client raises nothing", () => {
    assert.deepEqual(assessRisk(HEALTHY, THRESHOLDS), []);
  });

  test("skipped cleans are flagged once they hit the company's threshold", () => {
    assert.equal(assessRisk({ ...HEALTHY, skippedCycles: 1 }, THRESHOLDS).length, 0);
    const flags = assessRisk({ ...HEALTHY, skippedCycles: 2 }, THRESHOLDS);
    assert.equal(flags[0].reason, "SKIPPED_CYCLES");
    assert.equal(flags[0].score, 60);
  });

  test("more skips means more urgency", () => {
    const two = assessRisk({ ...HEALTHY, skippedCycles: 2 }, THRESHOLDS)[0].score;
    const four = assessRisk({ ...HEALTHY, skippedCycles: 4 }, THRESHOLDS)[0].score;
    assert.ok(four > two, `${four} should beat ${two}`);
  });

  test("a one-off client is not judged on skipped cycles", () => {
    const flags = assessRisk({ ...HEALTHY, skippedCycles: 5, isRecurring: false }, THRESHOLDS);
    assert.equal(flags.some((f) => f.reason === "SKIPPED_CYCLES"), false);
  });

  test("a full star of decline is flagged; less is not", () => {
    assert.equal(
      assessRisk({ ...HEALTHY, earlierAverageStars: 5, recentAverageStars: 4.5 }, THRESHOLDS).length,
      0,
    );
    const flags = assessRisk({ ...HEALTHY, earlierAverageStars: 5, recentAverageStars: 3.5 }, THRESHOLDS);
    assert.equal(flags[0].reason, "RATING_DECLINE");
  });

  test("a client with no rating history is not accused of declining", () => {
    const flags = assessRisk({ ...HEALTHY, recentAverageStars: null, earlierAverageStars: null }, THRESHOLDS);
    assert.equal(flags.some((f) => f.reason === "RATING_DECLINE"), false);
  });

  test("an invoice a fortnight late counts, a fresh one does not", () => {
    assert.equal(
      assessRisk({ ...HEALTHY, overdueInvoices: 1, worstDaysOverdue: 3 }, THRESHOLDS).length,
      0,
    );
    const flags = assessRisk({ ...HEALTHY, overdueInvoices: 1, worstDaysOverdue: 40 }, THRESHOLDS);
    assert.equal(flags[0].reason, "PAYMENT_FRICTION");
  });

  test("silence past the win-back window is flagged", () => {
    assert.equal(assessRisk({ ...HEALTHY, daysSinceLastJob: 59 }, THRESHOLDS).length, 0);
    const flags = assessRisk({ ...HEALTHY, daysSinceLastJob: 60 }, THRESHOLDS);
    assert.equal(flags[0].reason, "INACTIVITY");
  });

  test("a client who has never booked cannot be inactive", () => {
    const flags = assessRisk({ ...HEALTHY, daysSinceLastJob: null }, THRESHOLDS);
    assert.equal(flags.some((f) => f.reason === "INACTIVITY"), false);
  });

  test("two complaints in ninety days is a pattern; one is not", () => {
    assert.equal(assessRisk({ ...HEALTHY, recentComplaints: 1 }, THRESHOLDS).length, 0);
    const flags = assessRisk({ ...HEALTHY, recentComplaints: 3 }, THRESHOLDS);
    assert.equal(flags[0].reason, "COMPLAINT_HISTORY");
  });

  test("several problems at once are all reported, worst first", () => {
    const flags = assessRisk({
      ...HEALTHY,
      skippedCycles: 3,
      daysSinceLastJob: 90,
      overdueInvoices: 2,
      worstDaysOverdue: 30,
      recentComplaints: 2,
    }, THRESHOLDS);
    assert.equal(flags.length, 4);
    for (let i = 1; i < flags.length; i++) {
      assert.ok(flags[i - 1].score >= flags[i].score, "flags must be sorted worst first");
    }
  });

  test("no score ever exceeds one hundred", () => {
    const flags = assessRisk({
      ...HEALTHY, skippedCycles: 20, daysSinceLastJob: 900,
      overdueInvoices: 9, worstDaysOverdue: 400, recentComplaints: 20,
    }, THRESHOLDS);
    for (const f of flags) assert.ok(f.score <= 100, `${f.reason} scored ${f.score}`);
  });

  test("every flag says what to actually do about it", () => {
    const flags = assessRisk({ ...HEALTHY, skippedCycles: 3, recentComplaints: 4 }, THRESHOLDS);
    for (const f of flags) assert.ok(f.suggestedAction.length > 20, f.reason);
  });

  test("the worst score is what the list sorts on", () => {
    assert.equal(worstRiskScore([{ score: 30 }, { score: 82 }, { score: 41 }]), 82);
    assert.equal(worstRiskScore([]), 0);
  });
});

const CONTACTABLE = {
  daysSinceLastJob: 90,
  inactiveDays: 60,
  daysSinceLastCampaign: null,
  isBookingPaused: false,
  hasEmail: true,
  hasPhone: true,
};

describe("who gets a win-back offer", () => {
  test("a quiet, contactable, unpaused client is eligible", () => {
    assert.deepEqual(winbackEligible(CONTACTABLE), { eligible: true });
  });

  test("somebody who booked recently is left alone", () => {
    assert.equal(
      winbackEligible({ ...CONTACTABLE, daysSinceLastJob: 20 }).eligible, false);
  });

  test("a client paused for non-payment is never sent an offer", () => {
    const out = winbackEligible({ ...CONTACTABLE, isBookingPaused: true });
    assert.equal(out.eligible, false);
    assert.equal(out.eligible === false && out.reason, "PAUSED");
  });

  test("somebody contacted a fortnight ago is not pestered again", () => {
    const out = winbackEligible({ ...CONTACTABLE, daysSinceLastCampaign: 14 });
    assert.equal(out.eligible === false && out.reason, "ALREADY_CONTACTED");
  });

  test("but a campaign from months ago does not block a new one", () => {
    assert.equal(winbackEligible({ ...CONTACTABLE, daysSinceLastCampaign: 120 }).eligible, true);
  });

  test("no email and no phone means there is nothing to send", () => {
    const out = winbackEligible({ ...CONTACTABLE, hasEmail: false, hasPhone: false });
    assert.equal(out.eligible === false && out.reason, "NO_CONTACT");
  });

  test("a phone alone is enough, because WhatsApp works", () => {
    assert.equal(winbackEligible({ ...CONTACTABLE, hasEmail: false }).eligible, true);
  });

  test("someone who never booked cannot be won back", () => {
    const out = winbackEligible({ ...CONTACTABLE, daysSinceLastJob: null });
    assert.equal(out.eligible === false && out.reason, "NEVER_BOOKED");
  });
});

describe("what a referral is worth", () => {
  test("a fixed reward ignores the job value", () => {
    const r = referralRewardFils({
      discountType: "FIXED",
      referrerRewardValue: aed(50),
      refereeRewardValue: aed(30),
      qualifyingJobValueFils: aed(2000),
    });
    assert.equal(r.referrerFils, aed(50));
    assert.equal(r.refereeFils, aed(30));
  });

  test("a percentage reward scales with the job", () => {
    const r = referralRewardFils({
      discountType: "PERCENTAGE",
      referrerRewardValue: 1000, // 10%
      refereeRewardValue: 500,   // 5%
      qualifyingJobValueFils: aed(800),
    });
    assert.equal(r.referrerFils, aed(80));
    assert.equal(r.refereeFils, aed(40));
  });

  test("a negative fixed reward is treated as nothing, never as a charge", () => {
    const r = referralRewardFils({
      discountType: "FIXED", referrerRewardValue: -5000, refereeRewardValue: 0,
      qualifyingJobValueFils: aed(500),
    });
    assert.equal(r.referrerFils, 0);
  });
});

const PENDING = {
  status: "PENDING",
  jobCompleted: true,
  jobPaid: true,
  referrerClientId: "a",
  refereeClientId: "b",
};

describe("when a referral earns its reward", () => {
  test("completed and paid qualifies", () => {
    assert.deepEqual(referralQualifies(PENDING), { qualifies: true });
  });

  test("a booked but unfinished job does not", () => {
    const out = referralQualifies({ ...PENDING, jobCompleted: false });
    assert.equal(out.qualifies === false && out.reason, "NOT_COMPLETED");
  });

  test("a finished but unpaid job does not — that is how the scheme gets gamed", () => {
    const out = referralQualifies({ ...PENDING, jobPaid: false });
    assert.equal(out.qualifies === false && out.reason, "NOT_PAID");
  });

  test("nobody can refer themselves", () => {
    const out = referralQualifies({ ...PENDING, refereeClientId: "a" });
    assert.equal(out.qualifies === false && out.reason, "SELF_REFERRAL");
  });

  test("a referral is never rewarded twice", () => {
    for (const status of ["QUALIFIED", "REWARDED"]) {
      const out = referralQualifies({ ...PENDING, status });
      assert.equal(out.qualifies === false && out.reason, "ALREADY_QUALIFIED");
    }
  });

  test("a cancelled referral stays cancelled", () => {
    const out = referralQualifies({ ...PENDING, status: "CANCELLED" });
    assert.equal(out.qualifies === false && out.reason, "CANCELLED");
  });
});
