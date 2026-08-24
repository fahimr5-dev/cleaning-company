import { prisma } from "@/lib/prisma";
import {
  findConflicts, utilisationFor, dateKey, occupiesSlot,
  type ScheduledJob, type TeamRules,
} from "@/lib/scheduling";
import { startOfDay, addDays, startOfWeek } from "@/lib/recurrence";
import {
  cellKey, type ScheduleWeek, type ScheduleJobCard, type ScheduleTeam,
  type CellUtilisation, type JobStatus,
} from "@/lib/schedule-shared";

export type { ScheduleWeek, ScheduleJobCard, ScheduleTeam };

/**
 * Loads one week of the schedule: which team is doing what, on which day, and
 * where each day stands against that team's capacity.
 */
export async function getScheduleWeek(anchor: Date): Promise<ScheduleWeek> {
  const weekStart = startOfWeek(anchor); // Sunday, matching the UAE week
  const weekEnd = addDays(weekStart, 7);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const [org, teamRows, jobRows, travelRows, approvedLeave] = await Promise.all([
    prisma.organization.findFirst(),
    prisma.team.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { members: { where: { leftAt: null } } } } },
    }),
    prisma.job.findMany({
      where: {
        deletedAt: null,
        scheduledStart: { gte: weekStart, lt: weekEnd },
      },
      orderBy: { scheduledStart: "asc" },
      select: {
        id: true, jobNo: true, teamId: true, clientId: true, status: true,
        scheduledStart: true, scheduledEnd: true, durationMinutes: true,
        totalFils: true, cleanersRequired: true, seriesId: true,
        client: { select: { contactName: true, companyName: true } },
        serviceType: { select: { nameEn: true, nameAr: true } },
        property: { select: { zoneId: true, zone: { select: { nameEn: true, nameAr: true } } } },
      },
    }),
    prisma.zoneTravelTime.findMany(),
    prisma.leaveRequest.findMany({
      where: {
        status: "APPROVED",
        startDate: { lt: weekEnd },
        endDate: { gte: weekStart },
      },
      select: { staffId: true, startDate: true, endDate: true },
    }),
  ]);

  const weekendDays = org?.weekendDays ?? [5, 6];
  const travelBuffer = org?.defaultTravelBufferMinutes ?? 0;

  const travelMap = new Map(travelRows.map((t) => [`${t.fromZoneId}|${t.toZoneId}`, t.minutes]));
  const travelMinutes = (from: string, to: string) => travelMap.get(`${from}|${to}`) ?? null;

  const teams: ScheduleTeam[] = teamRows.map((t) => ({
    id: t.id,
    name: t.name,
    nameAr: t.nameAr,
    colorHex: t.colorHex,
    capacityMinutesPerDay: t.capacityMinutesPerDay,
    workingDays: t.workingDays,
    shiftStart: t.shiftStart,
    shiftEnd: t.shiftEnd,
    memberCount: t._count.members,
  }));

  const teamRules: TeamRules[] = teams.map((t) => ({
    id: t.id,
    capacityMinutesPerDay: t.capacityMinutesPerDay,
    workingDays: t.workingDays,
    shiftStart: t.shiftStart,
    shiftEnd: t.shiftEnd,
  }));

  // A team counts as away only when EVERY one of its members is on leave.
  const membersByTeam = await prisma.teamMember.findMany({
    where: { leftAt: null, teamId: { in: teams.map((t) => t.id) } },
    select: { teamId: true, staffId: true },
  });
  const teamLeaveDates = new Map<string, Set<string>>();
  for (const team of teams) {
    const memberIds = membersByTeam.filter((m) => m.teamId === team.id).map((m) => m.staffId);
    if (memberIds.length === 0) continue;
    const dates = new Set<string>();
    for (const day of days) {
      const away = memberIds.filter((id) =>
        approvedLeave.some(
          (l) => l.staffId === id && startOfDay(l.startDate) <= day && startOfDay(l.endDate) >= day,
        ),
      );
      if (away.length === memberIds.length) dates.add(dateKey(day));
    }
    teamLeaveDates.set(team.id, dates);
  }

  const scheduled: ScheduledJob[] = jobRows.map((j) => ({
    id: j.id,
    teamId: j.teamId,
    start: j.scheduledStart,
    end: j.scheduledEnd,
    zoneId: j.property.zoneId,
    jobNo: j.jobNo,
    status: j.status,
    durationMinutes: j.durationMinutes,
  }));

  const toCard = (j: (typeof jobRows)[number]): ScheduleJobCard => {
    const candidate = scheduled.find((s) => s.id === j.id)!;
    const teamJobs = j.teamId ? scheduled.filter((s) => s.teamId === j.teamId) : [];
    const team = teamRules.find((t) => t.id === j.teamId) ?? null;

    return {
      id: j.id,
      jobNo: j.jobNo,
      teamId: j.teamId,
      clientId: j.clientId,
      clientName: j.client.companyName ?? j.client.contactName,
      serviceNameEn: j.serviceType.nameEn,
      serviceNameAr: j.serviceType.nameAr,
      zoneId: j.property.zoneId,
      zoneNameEn: j.property.zone?.nameEn ?? null,
      zoneNameAr: j.property.zone?.nameAr ?? null,
      start: j.scheduledStart.toISOString(),
      end: j.scheduledEnd.toISOString(),
      durationMinutes: j.durationMinutes,
      status: j.status as JobStatus,
      totalFils: j.totalFils,
      cleanersRequired: j.cleanersRequired,
      seriesId: j.seriesId,
      isRecurring: Boolean(j.seriesId),
      // Only flag live jobs: a cancelled visit having "conflicts" is noise.
      conflicts: occupiesSlot(j.status)
        ? findConflicts({
            candidate,
            teamJobs,
            team,
            travelMinutes,
            travelBufferMinutes: travelBuffer,
            teamUnavailableDates: [],
          })
        : [],
    };
  };

  const jobsByCell: Record<string, ScheduleJobCard[]> = {};
  const unassigned: ScheduleJobCard[] = [];

  for (const row of jobRows) {
    const card = toCard(row);
    if (!card.teamId) {
      unassigned.push(card);
      continue;
    }
    const key = cellKey(card.teamId, dateKey(row.scheduledStart));
    (jobsByCell[key] ??= []).push(card);
  }
  for (const list of Object.values(jobsByCell)) {
    list.sort((a, b) => a.start.localeCompare(b.start));
  }

  const utilisationRows = utilisationFor(scheduled, teamRules, days);
  const utilisation: Record<string, CellUtilisation> = {};
  for (const row of utilisationRows) {
    const team = teams.find((t) => t.id === row.teamId)!;
    const date = new Date(`${row.date}T00:00:00`);
    utilisation[cellKey(row.teamId, row.date)] = {
      bookedMinutes: row.bookedMinutes,
      capacityMinutes: row.capacityMinutes,
      percent: row.percent,
      jobCount: row.jobCount,
      isNonWorkingDay: !team.workingDays.includes(date.getDay()),
      isOnLeave: teamLeaveDates.get(row.teamId)?.has(row.date) ?? false,
    };
  }

  const live = jobRows.filter((j) => occupiesSlot(j.status));
  const bookedMinutes = live.reduce((t, j) => t + j.durationMinutes, 0);
  const capacityMinutes = utilisationRows.reduce((t, r) => t + r.capacityMinutes, 0);

  return {
    days: days.map(dateKey),
    weekStart: dateKey(weekStart),
    weekEnd: dateKey(addDays(weekStart, 6)),
    weekendDays,
    teams,
    jobsByCell,
    utilisation,
    unassigned,
    totals: {
      jobCount: live.length,
      bookedMinutes,
      capacityMinutes,
      percent: capacityMinutes > 0 ? Math.round((bookedMinutes / capacityMinutes) * 100) : 0,
      revenueFils: live.reduce((t, j) => t + j.totalFils, 0),
    },
  };
}

/**
 * Re-checks one job where it is being moved to, without saving anything.
 * The board calls this before a drop so it can warn first.
 */
export async function checkJobPlacement(input: {
  jobId: string;
  teamId: string;
  start: Date;
}) {
  const [job, org, team, travelRows] = await Promise.all([
    prisma.job.findFirst({
      where: { id: input.jobId, deletedAt: null },
      select: {
        id: true, jobNo: true, status: true, durationMinutes: true,
        property: { select: { zoneId: true } },
      },
    }),
    prisma.organization.findFirst(),
    prisma.team.findFirst({ where: { id: input.teamId, deletedAt: null } }),
    prisma.zoneTravelTime.findMany(),
  ]);
  if (!job || !team) return null;

  const end = new Date(input.start.getTime() + job.durationMinutes * 60_000);
  const dayStart = startOfDay(input.start);
  const dayEnd = addDays(dayStart, 1);

  const sameDayJobs = await prisma.job.findMany({
    where: {
      deletedAt: null,
      teamId: input.teamId,
      id: { not: input.jobId },
      scheduledStart: { gte: dayStart, lt: dayEnd },
    },
    select: {
      id: true, jobNo: true, teamId: true, status: true, durationMinutes: true,
      scheduledStart: true, scheduledEnd: true,
      property: { select: { zoneId: true } },
    },
  });

  const travelMap = new Map(travelRows.map((t) => [`${t.fromZoneId}|${t.toZoneId}`, t.minutes]));

  return findConflicts({
    candidate: {
      id: job.id, teamId: input.teamId, start: input.start, end,
      zoneId: job.property.zoneId, jobNo: job.jobNo, status: job.status,
      durationMinutes: job.durationMinutes,
    },
    teamJobs: sameDayJobs.map((j) => ({
      id: j.id, teamId: j.teamId, start: j.scheduledStart, end: j.scheduledEnd,
      zoneId: j.property.zoneId, jobNo: j.jobNo, status: j.status,
      durationMinutes: j.durationMinutes,
    })),
    team: {
      id: team.id,
      capacityMinutesPerDay: team.capacityMinutesPerDay,
      workingDays: team.workingDays,
      shiftStart: team.shiftStart,
      shiftEnd: team.shiftEnd,
    },
    travelMinutes: (from, to) => travelMap.get(`${from}|${to}`) ?? null,
    travelBufferMinutes: org?.defaultTravelBufferMinutes ?? 0,
  });
}
