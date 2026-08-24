import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  documentStatus, staffCompliance, leaveBalance, payrollHours, wpsLine,
  type DocumentCheck,
} from "@/lib/hr";

/** Reads for the staff list, one person's file, and the payroll export. */

export type StaffRow = {
  id: string;
  employeeNo: string;
  fullName: string;
  position: string;
  employmentStatus: string;
  phone: string;
  teamNames: string[];
  complianceStatus: string;
  blockedFromWork: boolean;
  soonestExpiryDays: number | null;
  expiredCount: number;
  expiringCount: number;
  onLeaveToday: boolean;
  /** Null for anyone not allowed to see it — never zero, which would be a lie. */
  monthlyPackageFils: number | null;
};

export async function getStaff(options: {
  search?: string;
  status?: string;
  compliance?: string;
  canSeeSalary: boolean;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const search = options.search?.trim();

  const where: Prisma.StaffWhereInput = {
    deletedAt: null,
    ...(options.status && options.status !== "ALL"
      ? { employmentStatus: options.status as never }
      : { employmentStatus: { not: "TERMINATED" } }),
    ...(search
      ? {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { employeeNo: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const org = await prisma.organization.findFirst({ select: { complianceAlertDays: true } });
  const warnWithinDays = Math.max(...(org?.complianceAlertDays ?? [60]));

  const staff = await prisma.staff.findMany({
    where,
    orderBy: [{ employmentStatus: "asc" }, { firstName: "asc" }],
    select: {
      id: true, employeeNo: true, firstName: true, lastName: true,
      position: true, employmentStatus: true, phone: true,
      basicSalaryFils: options.canSeeSalary,
      allowancesFils: options.canSeeSalary,
      documents: {
        where: { deletedAt: null },
        select: { type: true, expiresAt: true },
      },
      teamMemberships: {
        where: { leftAt: null },
        select: { team: { select: { name: true } } },
      },
      leaveRequests: {
        where: {
          status: "APPROVED",
          startDate: { lte: now },
          endDate: { gte: now },
        },
        select: { id: true },
      },
    },
  });

  const rows = staff.map((person): StaffRow => {
    const checks: DocumentCheck[] = person.documents.map((d) =>
      documentStatus({ type: d.type, expiresAt: d.expiresAt, now, warnWithinDays }));
    const summary = staffCompliance(checks);

    return {
      id: person.id,
      employeeNo: person.employeeNo,
      fullName: `${person.firstName} ${person.lastName}`,
      position: person.position,
      employmentStatus: person.employmentStatus,
      phone: person.phone,
      teamNames: person.teamMemberships.map((m) => m.team.name),
      complianceStatus: summary.status,
      blockedFromWork: summary.blockedFromWork,
      soonestExpiryDays: summary.soonestDays,
      expiredCount: summary.expiredCount,
      expiringCount: summary.expiringCount,
      onLeaveToday: person.leaveRequests.length > 0,
      monthlyPackageFils: options.canSeeSalary
        ? (person.basicSalaryFils ?? 0) + (person.allowancesFils ?? 0)
        : null,
    };
  });

  const filtered = options.compliance && options.compliance !== "ALL"
    ? rows.filter((r) =>
        options.compliance === "PROBLEM"
          ? r.complianceStatus !== "VALID"
          : r.complianceStatus === options.compliance)
    : rows;

  // Worst compliance first — that is the reason to open this screen.
  const rank = { EXPIRED: 0, MISSING: 1, EXPIRING: 2, VALID: 3 } as Record<string, number>;
  filtered.sort((a, b) =>
    (rank[a.complianceStatus] ?? 9) - (rank[b.complianceStatus] ?? 9) ||
    (a.soonestExpiryDays ?? 99999) - (b.soonestExpiryDays ?? 99999));

  return {
    rows: filtered,
    total: filtered.length,
    summary: {
      active: rows.filter((r) => r.employmentStatus === "ACTIVE").length,
      blocked: rows.filter((r) => r.blockedFromWork).length,
      expiringSoon: rows.filter((r) => r.complianceStatus === "EXPIRING").length,
      onLeaveToday: rows.filter((r) => r.onLeaveToday).length,
    },
  };
}

export async function getStaffDetail(id: string, options: { canSeeSalary: boolean; now?: Date }) {
  const now = options.now ?? new Date();

  const org = await prisma.organization.findFirst({ select: { complianceAlertDays: true } });
  const warnWithinDays = Math.max(...(org?.complianceAlertDays ?? [60]));

  const person = await prisma.staff.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, employeeNo: true, firstName: true, lastName: true, phone: true,
      email: true, nationality: true, position: true, employmentStatus: true,
      hiredAt: true, terminatedAt: true, annualLeaveDays: true, locale: true,
      emergencyContactName: true, emergencyContactPhone: true,
      basicSalaryFils: options.canSeeSalary,
      allowancesFils: options.canSeeSalary,
      iban: options.canSeeSalary,
      wpsLabourCardNo: options.canSeeSalary,
      documents: {
        where: { deletedAt: null },
        orderBy: { expiresAt: "asc" },
        select: {
          id: true, type: true, number: true, issuedAt: true,
          expiresAt: true, fileUrl: true, notes: true,
        },
      },
      teamMemberships: {
        where: { leftAt: null },
        select: { isLead: true, team: { select: { id: true, name: true } } },
      },
      leaveRequests: {
        orderBy: { startDate: "desc" },
        take: 20,
        select: {
          id: true, type: true, startDate: true, endDate: true, days: true,
          status: true, reason: true, decisionNote: true, decidedAt: true,
        },
      },
      timeEntries: {
        orderBy: { clockInAt: "desc" },
        take: 30,
        select: {
          id: true, clockInAt: true, clockOutAt: true, minutesWorked: true,
          reviewStatus: true, clockInFlagged: true, clockOutFlagged: true,
          reviewNote: true,
          job: { select: { jobNo: true } },
        },
      },
    },
  });
  if (!person) return null;

  const checks = person.documents.map((d) => ({
    ...d,
    check: documentStatus({ type: d.type, expiresAt: d.expiresAt, now, warnWithinDays }),
  }));

  return {
    person,
    compliance: staffCompliance(checks.map((c) => c.check)),
    documents: checks,
    balance: leaveBalance({
      entitlementDays: person.annualLeaveDays,
      requests: person.leaveRequests.map((r) => ({ type: r.type, days: r.days, status: r.status })),
    }),
    hours: payrollHours(person.timeEntries.map((e) => ({
      minutesWorked: e.minutesWorked ?? 0,
      reviewStatus: e.reviewStatus,
      flagged: e.clockInFlagged || e.clockOutFlagged,
    }))),
  };
}

/** Every clock-in a manager still has to look at, because the GPS did not match. */
export async function getTimesheetQueue(limit = 50) {
  const entries = await prisma.timeEntry.findMany({
    where: { reviewStatus: "PENDING" },
    orderBy: { clockInAt: "desc" },
    take: limit,
    select: {
      id: true, clockInAt: true, clockOutAt: true, minutesWorked: true,
      clockInFlagged: true, clockOutFlagged: true,
      clockInDistanceM: true, clockOutDistanceM: true,
      staff: { select: { id: true, firstName: true, lastName: true, employeeNo: true } },
      job: {
        select: {
          jobNo: true,
          property: { select: { label: true, zone: { select: { nameEn: true } } } },
        },
      },
    },
  });

  return entries.map((e) => ({
    id: e.id,
    staffId: e.staff.id,
    staffName: `${e.staff.firstName} ${e.staff.lastName}`,
    employeeNo: e.staff.employeeNo,
    jobNo: e.job?.jobNo ?? null,
    address: e.job?.property?.zone?.nameEn ?? e.job?.property?.label ?? null,
    clockInAt: e.clockInAt.toISOString(),
    clockOutAt: e.clockOutAt?.toISOString() ?? null,
    minutesWorked: e.minutesWorked ?? 0,
    /** How far outside the geofence, in metres — the reason it needs a look. */
    worstDistanceM: Math.max(e.clockInDistanceM ?? 0, e.clockOutDistanceM ?? 0),
    flaggedIn: e.clockInFlagged,
    flaggedOut: e.clockOutFlagged,
  }));
}

/** Leave waiting for a yes or no. */
export async function getPendingLeave() {
  const requests = await prisma.leaveRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { startDate: "asc" },
    select: {
      id: true, type: true, startDate: true, endDate: true, days: true, reason: true,
      staff: {
        select: {
          id: true, firstName: true, lastName: true, employeeNo: true,
          annualLeaveDays: true,
          leaveRequests: { select: { type: true, days: true, status: true } },
        },
      },
    },
  });

  return requests.map((r) => ({
    id: r.id,
    type: r.type,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate.toISOString(),
    days: r.days,
    reason: r.reason,
    staffId: r.staff.id,
    staffName: `${r.staff.firstName} ${r.staff.lastName}`,
    employeeNo: r.staff.employeeNo,
    balance: leaveBalance({
      entitlementDays: r.staff.annualLeaveDays,
      requests: r.staff.leaveRequests,
    }),
  }));
}

/**
 * One month's pay lines, ready to hand to the bank.
 *
 * OWNER ONLY — the caller must have checked. Anyone missing an IBAN is listed
 * with the reason rather than quietly dropped from the file.
 */
export async function getPayroll(year: number, month: number) {
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const daysInMonth = periodEnd.getUTCDate();

  const staff = await prisma.staff.findMany({
    where: { deletedAt: null, employmentStatus: { not: "TERMINATED" } },
    orderBy: { employeeNo: "asc" },
    select: {
      id: true, employeeNo: true, firstName: true, lastName: true,
      basicSalaryFils: true, allowancesFils: true, iban: true, wpsLabourCardNo: true,
      leaveRequests: {
        where: {
          status: "APPROVED",
          type: "UNPAID",
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        select: { days: true },
      },
      timeEntries: {
        where: { clockInAt: { gte: periodStart, lte: periodEnd } },
        select: { minutesWorked: true, reviewStatus: true, clockInFlagged: true },
      },
    },
  });

  const lines = staff.map((person) => {
    const hours = payrollHours(person.timeEntries.map((e) => ({
      minutesWorked: e.minutesWorked ?? 0,
      reviewStatus: e.reviewStatus,
      flagged: e.clockInFlagged,
    })));

    return {
      ...wpsLine({
        employeeNo: person.employeeNo,
        fullName: `${person.firstName} ${person.lastName}`,
        iban: person.iban,
        labourCardNo: person.wpsLabourCardNo,
        basicSalaryFils: person.basicSalaryFils,
        allowancesFils: person.allowancesFils,
        unpaidLeaveDays: person.leaveRequests.reduce((t, r) => t + r.days, 0),
        daysInMonth,
      }),
      staffId: person.id,
      payableHours: hours.payableHours,
      hoursAwaitingReview: hours.entriesAwaitingReview,
    };
  });

  return {
    year,
    month,
    daysInMonth,
    lines,
    totalFils: lines.reduce((t, l) => t + l.totalFils, 0),
    problemCount: lines.filter((l) => l.problem).length,
    awaitingReview: lines.reduce((t, l) => t + l.hoursAwaitingReview, 0),
  };
}
