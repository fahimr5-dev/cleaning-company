import type { Conflict } from "@/lib/scheduling";

/**
 * Types the schedule board needs in the browser.
 *
 * NO DATABASE IMPORTS HERE. Anything this file imports gets shipped to every
 * phone that opens the schedule.
 */

export const JOB_STATUSES = [
  "SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_ACCESS",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type ScheduleJobCard = {
  id: string;
  jobNo: string;
  teamId: string | null;
  clientId: string;
  clientName: string;
  serviceNameEn: string;
  serviceNameAr: string;
  zoneId: string | null;
  zoneNameEn: string | null;
  zoneNameAr: string | null;
  /** ISO strings, because a Date cannot cross from server to browser intact. */
  start: string;
  end: string;
  durationMinutes: number;
  status: JobStatus;
  totalFils: number;
  cleanersRequired: number;
  /** Set when this visit belongs to a repeating booking. */
  seriesId: string | null;
  isRecurring: boolean;
  /** Problems this job already has where it currently sits. */
  conflicts: Conflict[];
};

export type ScheduleTeam = {
  id: string;
  name: string;
  nameAr: string | null;
  colorHex: string;
  capacityMinutesPerDay: number;
  workingDays: number[];
  shiftStart: string;
  shiftEnd: string;
  memberCount: number;
};

export type CellUtilisation = {
  bookedMinutes: number;
  capacityMinutes: number;
  percent: number;
  jobCount: number;
  /** True when nobody on this team is working that day. */
  isNonWorkingDay: boolean;
  /** True when the whole team is on approved leave. */
  isOnLeave: boolean;
};

export type ScheduleWeek = {
  /** yyyy-mm-dd for each of the seven days shown. */
  days: string[];
  weekStart: string;
  weekEnd: string;
  weekendDays: number[];
  teams: ScheduleTeam[];
  /** Keyed "teamId|yyyy-mm-dd". */
  jobsByCell: Record<string, ScheduleJobCard[]>;
  utilisation: Record<string, CellUtilisation>;
  /** Jobs with no team assigned yet — they need a home. */
  unassigned: ScheduleJobCard[];
  totals: {
    jobCount: number;
    bookedMinutes: number;
    capacityMinutes: number;
    percent: number;
    revenueFils: number;
  };
};

export function cellKey(teamId: string, date: string): string {
  return `${teamId}|${date}`;
}

/** The colours each status shows as on the board. */
export const STATUS_STYLES: Record<JobStatus, { block: string; dot: string }> = {
  SCHEDULED: {
    block: "bg-slate-100 border-slate-300 text-slate-900 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100",
    dot: "bg-slate-400",
  },
  EN_ROUTE: {
    block: "bg-blue-100 border-blue-300 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100",
    dot: "bg-blue-500",
  },
  IN_PROGRESS: {
    block: "bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  COMPLETED: {
    block: "bg-green-100 border-green-300 text-green-900 dark:bg-green-950 dark:border-green-800 dark:text-green-100",
    dot: "bg-green-600",
  },
  CANCELLED: {
    block: "bg-red-50 border-red-200 text-red-800 line-through dark:bg-red-950/50 dark:border-red-900 dark:text-red-200",
    dot: "bg-red-500",
  },
  NO_ACCESS: {
    block: "bg-orange-100 border-orange-300 text-orange-900 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-100",
    dot: "bg-orange-500",
  },
};
