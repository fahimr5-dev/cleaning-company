/**
 * The rules that decide whether a booking is sane.
 *
 * PLAIN ENGLISH: this is where "Team Alpha cannot be in Marina at 9 and Mirdif
 * at 10" lives, along with "this team is already booked solid" and "cancelling
 * this late costs a fee".
 *
 * Like the recurrence engine, this file is pure logic — no database and no
 * clock of its own — so every rule can be tested directly.
 */

export type ConflictSeverity = "BLOCK" | "WARN";

export type ConflictCode =
  | "DOUBLE_BOOKED"
  | "TRAVEL_TIME"
  | "OVER_CAPACITY"
  | "OUTSIDE_SHIFT"
  | "NON_WORKING_DAY"
  | "TEAM_ON_LEAVE";

export type Conflict = {
  code: ConflictCode;
  severity: ConflictSeverity;
  /** Filled in by the caller for display, e.g. the other job's number. */
  detail: Record<string, string | number>;
};

/** The shape of a job as far as these rules are concerned. */
export type ScheduledJob = {
  id: string;
  teamId: string | null;
  start: Date;
  end: Date;
  zoneId: string | null;
  jobNo: string;
  status: string;
  durationMinutes: number;
};

export type TeamRules = {
  id: string;
  capacityMinutesPerDay: number;
  /** 0 = Sunday … 6 = Saturday. */
  workingDays: number[];
  shiftStart: string;
  shiftEnd: string;
};

/** Minutes to drive between two zones; `null` when we have no figure. */
export type TravelLookup = (fromZoneId: string, toZoneId: string) => number | null;

/** Statuses that still occupy a slot in the diary. */
export const ACTIVE_JOB_STATUSES = ["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"] as const;

export function occupiesSlot(status: string): boolean {
  return (ACTIVE_JOB_STATUSES as readonly string[]).includes(status);
}

function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  // Touching end-to-start is not an overlap: 09:00–11:00 and 11:00–13:00 are fine.
  return aStart < bEnd && bStart < aEnd;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Checks one proposed booking against everything else that team is doing.
 *
 * Returns every problem it finds, worst first. An empty list means the booking
 * is clean.
 */
export function findConflicts(input: {
  candidate: ScheduledJob;
  /** The team's other jobs. The candidate itself is ignored if present. */
  teamJobs: ScheduledJob[];
  team: TeamRules | null;
  travelMinutes: TravelLookup;
  /** Extra minutes allowed on top of the drive time, for parking and lifts. */
  travelBufferMinutes?: number;
  /** Dates the whole team is unavailable (approved leave, for example). */
  teamUnavailableDates?: Date[];
}): Conflict[] {
  const { candidate, team, travelMinutes } = input;
  const buffer = input.travelBufferMinutes ?? 0;
  const conflicts: Conflict[] = [];

  const others = input.teamJobs
    .filter((j) => j.id !== candidate.id && occupiesSlot(j.status))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  // 1. Is the team already on another job at this time?
  for (const other of others) {
    if (overlaps(candidate.start, candidate.end, other.start, other.end)) {
      conflicts.push({
        code: "DOUBLE_BOOKED",
        severity: "BLOCK",
        detail: {
          jobNo: other.jobNo,
          otherStart: other.start.toISOString(),
          otherEnd: other.end.toISOString(),
        },
      });
    }
  }

  // 2. Can they physically get there from the job before, and on to the next?
  const sameDayJobs = others.filter((j) => sameDay(j.start, candidate.start));

  const previous = [...sameDayJobs].filter((j) => j.end <= candidate.start).pop();
  if (previous) checkTravel(previous, candidate);

  const next = sameDayJobs.find((j) => j.start >= candidate.end);
  if (next) checkTravel(candidate, next);

  function checkTravel(first: ScheduledJob, second: ScheduledJob) {
    if (!first.zoneId || !second.zoneId) return;
    const drive = travelMinutes(first.zoneId, second.zoneId);
    if (drive === null) return; // no figure for this pair — say nothing

    const gapMinutes = Math.round((second.start.getTime() - first.end.getTime()) / 60_000);
    const needed = drive + buffer;
    if (gapMinutes < needed) {
      conflicts.push({
        code: "TRAVEL_TIME",
        severity: "WARN",
        detail: {
          fromJobNo: first.jobNo,
          toJobNo: second.jobNo,
          gapMinutes,
          neededMinutes: needed,
          driveMinutes: drive,
        },
      });
    }
  }

  if (team) {
    // 3. Does the team work that day at all?
    if (!team.workingDays.includes(candidate.start.getDay())) {
      conflicts.push({
        code: "NON_WORKING_DAY",
        severity: "WARN",
        detail: { weekday: candidate.start.getDay() },
      });
    }

    // 4. Does it fall inside their shift?
    const startMinutes = candidate.start.getHours() * 60 + candidate.start.getMinutes();
    const endMinutes = candidate.end.getHours() * 60 + candidate.end.getMinutes();
    const shiftStart = minutesOfDay(team.shiftStart);
    const shiftEnd = minutesOfDay(team.shiftEnd);
    const endsNextDay = !sameDay(candidate.start, candidate.end);

    if (startMinutes < shiftStart || endsNextDay || endMinutes > shiftEnd) {
      conflicts.push({
        code: "OUTSIDE_SHIFT",
        severity: "WARN",
        detail: { shiftStart: team.shiftStart, shiftEnd: team.shiftEnd },
      });
    }

    // 5. Would the day go over the team's sellable minutes?
    const bookedThatDay = sameDayJobs.reduce((total, j) => total + j.durationMinutes, 0);
    const wouldBe = bookedThatDay + candidate.durationMinutes;
    if (wouldBe > team.capacityMinutesPerDay) {
      conflicts.push({
        code: "OVER_CAPACITY",
        severity: "WARN",
        detail: {
          bookedMinutes: wouldBe,
          capacityMinutes: team.capacityMinutesPerDay,
          overBy: wouldBe - team.capacityMinutesPerDay,
        },
      });
    }
  }

  // 6. Is the team away?
  if ((input.teamUnavailableDates ?? []).some((date) => sameDay(date, candidate.start))) {
    conflicts.push({ code: "TEAM_ON_LEAVE", severity: "WARN", detail: {} });
  }

  const order: ConflictSeverity[] = ["BLOCK", "WARN"];
  return conflicts.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
}

/** Anything that must stop a save outright. */
export function blockingConflicts(conflicts: Conflict[]): Conflict[] {
  return conflicts.filter((c) => c.severity === "BLOCK");
}

/* ------------------------------- utilisation ------------------------------ */

export type Utilisation = {
  teamId: string;
  date: string; // yyyy-mm-dd
  bookedMinutes: number;
  capacityMinutes: number;
  percent: number;
  jobCount: number;
};

/**
 * Capacity sold divided by capacity available, per team per day.
 *
 * This is the number that tells you whether to hire, and it is why a team's
 * daily capacity is a setting rather than a guess.
 */
export function utilisationFor(
  jobs: ScheduledJob[],
  teams: TeamRules[],
  days: Date[],
): Utilisation[] {
  const out: Utilisation[] = [];

  for (const team of teams) {
    for (const day of days) {
      const onDay = jobs.filter(
        (j) => j.teamId === team.id && occupiesSlot(j.status) && sameDay(j.start, day),
      );
      const bookedMinutes = onDay.reduce((total, j) => total + j.durationMinutes, 0);
      // A day the team does not work has no capacity to sell, so utilisation is
      // 0% rather than a misleading "infinity".
      const worksToday = team.workingDays.includes(day.getDay());
      const capacityMinutes = worksToday ? team.capacityMinutesPerDay : 0;

      out.push({
        teamId: team.id,
        date: dateKey(day),
        bookedMinutes,
        capacityMinutes,
        percent: capacityMinutes > 0 ? Math.round((bookedMinutes / capacityMinutes) * 100) : 0,
        jobCount: onDay.length,
      });
    }
  }

  return out;
}

export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* --------------------------- cancelling and moving ------------------------ */

export type CancellationPolicy = {
  /** How many hours' notice a client must give. */
  cutoffHours: number;
  /** A percentage of the job price, in basis points. */
  feeBps: number;
  /** Or a flat fee in fils. Both can apply. */
  feeFlatFils: number;
};

export type CancellationOutcome = {
  isLate: boolean;
  hoursNotice: number;
  feeFils: number;
  reason: "WITHIN_NOTICE" | "LATE" | "ALREADY_STARTED";
};

/**
 * Works out whether a cancellation is late and what it costs.
 *
 * Deliberately returns the outcome rather than throwing, so the screen can warn
 * the client BEFORE they confirm — "cancel now and it costs AED 50" — instead
 * of surprising them afterwards.
 */
export function assessCancellation(input: {
  jobStart: Date;
  now: Date;
  jobPriceFils: number;
  policy: CancellationPolicy;
}): CancellationOutcome {
  const { jobStart, now, jobPriceFils, policy } = input;
  const hoursNotice = (jobStart.getTime() - now.getTime()) / 3_600_000;

  if (hoursNotice >= policy.cutoffHours) {
    return { isLate: false, hoursNotice, feeFils: 0, reason: "WITHIN_NOTICE" };
  }

  const percentageFee = Math.round((jobPriceFils * policy.feeBps) / 10000);
  const feeFils = Math.min(jobPriceFils, percentageFee + policy.feeFlatFils);

  return {
    isLate: true,
    hoursNotice,
    feeFils,
    reason: hoursNotice <= 0 ? "ALREADY_STARTED" : "LATE",
  };
}

/** Whether a client may still move this booking themselves. */
export function canClientReschedule(input: {
  jobStart: Date;
  now: Date;
  status: string;
  cutoffHours: number;
}): { allowed: boolean; reason?: "TOO_LATE" | "WRONG_STATUS" } {
  if (input.status !== "SCHEDULED") return { allowed: false, reason: "WRONG_STATUS" };

  const hoursNotice = (input.jobStart.getTime() - input.now.getTime()) / 3_600_000;
  if (hoursNotice < input.cutoffHours) return { allowed: false, reason: "TOO_LATE" };

  return { allowed: true };
}
