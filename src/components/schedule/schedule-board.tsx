"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors,
  useDroppable, pointerWithin,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { CalendarOff, Plane } from "lucide-react";
import { moveJobAction } from "@/app/actions/schedule";
import { cellKey, type ScheduleWeek, type ScheduleJobCard } from "@/lib/schedule-shared";
import type { Conflict } from "@/lib/scheduling";
import { JobBlock } from "./job-block";
import { ConflictDialog } from "./conflict-dialog";
import { JobDetailSheet } from "./job-detail-sheet";
import { cn } from "@/lib/utils";

/**
 * The weekly schedule: teams down the side, days across the top.
 *
 * PLAIN ENGLISH: drag a job onto a different team or day and it saves. If the
 * move would put a team in two places at once it is refused outright. If it is
 * merely questionable — a 45-minute drive with 20 minutes to do it in — you get
 * asked, because you know about the traffic and the software does not.
 */
export function ScheduleBoard({
  week, locale,
}: {
  week: ScheduleWeek;
  locale: "en" | "ar";
}) {
  const t = useTranslations("schedule");
  const router = useRouter();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<ScheduleJobCard | null>(null);
  const [pending, setPending] = useState<{
    jobId: string; teamId: string; start: string; conflicts: Conflict[];
  } | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const allJobs = useMemo(
    () => [...Object.values(week.jobsByCell).flat(), ...week.unassigned],
    [week],
  );
  const activeJob = allJobs.find((j) => j.id === activeId) ?? null;

  const dayFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    weekday: "short", day: "numeric", month: "short",
  });
  const todayKey = new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const [teamId, date] = String(over.id).split("|");
    if (!teamId || !date) return;

    const job = allJobs.find((j) => j.id === active.id);
    if (!job) return;

    // Keep the time of day, change the date and the team. Managers move work
    // between days far more often than they change the hour.
    const original = new Date(job.start);
    const [year, month, day] = date.split("-").map(Number);
    const newStart = new Date(original);
    newStart.setFullYear(year, month - 1, day);

    if (job.teamId === teamId && new Date(job.start).toDateString() === newStart.toDateString()) {
      return; // dropped back where it started
    }

    save(job.id, teamId, newStart.toISOString(), false);
  }

  function save(jobId: string, teamId: string, start: string, acceptWarnings: boolean) {
    startTransition(async () => {
      const result = await moveJobAction({ jobId, teamId, start, acceptWarnings, locale });

      if (result.ok) {
        toast.success(t("moved"));
        setPending(null);
        router.refresh();
        return;
      }

      if (result.error === "NEEDS_CONFIRMATION" && result.conflicts?.length) {
        setPending({ jobId, teamId, start, conflicts: result.conflicts });
        return;
      }

      toast.error(result.error);
      setPending(null);
      router.refresh(); // put the board back to what the server actually has
    });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="overflow-x-auto rounded-lg border">
          <div className="min-w-[64rem]">
            {/* Day headings */}
            <div className="bg-muted/50 grid grid-cols-[10rem_repeat(7,1fr)] border-b">
              <div className="p-2 text-xs font-medium">{t("team")}</div>
              {week.days.map((day) => {
                const date = new Date(`${day}T00:00:00`);
                const isWeekend = week.weekendDays.includes(date.getDay());
                return (
                  <div
                    key={day}
                    className={cn(
                      "border-s p-2 text-xs font-medium",
                      isWeekend && "bg-muted text-muted-foreground",
                      day === todayKey && "bg-primary/10 text-primary",
                    )}
                  >
                    {dayFmt.format(date)}
                    {day === todayKey ? <span className="ms-1">· {t("today")}</span> : null}
                  </div>
                );
              })}
            </div>

            {/* One row per team */}
            {week.teams.map((team) => (
              <div key={team.id} className="grid grid-cols-[10rem_repeat(7,1fr)] border-b last:border-b-0">
                <div className="flex items-start gap-2 p-2">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: team.colorHex }} aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {locale === "ar" ? (team.nameAr ?? team.name) : team.name}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {t("members", { count: team.memberCount })}
                    </p>
                    <p className="text-muted-foreground text-[11px] tabular-nums">
                      {team.shiftStart}–{team.shiftEnd}
                    </p>
                  </div>
                </div>

                {week.days.map((day) => (
                  <Cell
                    key={day}
                    teamId={team.id}
                    date={day}
                    isToday={day === todayKey}
                    isWeekend={week.weekendDays.includes(new Date(`${day}T00:00:00`).getDay())}
                    jobs={week.jobsByCell[cellKey(team.id, day)] ?? []}
                    utilisation={week.utilisation[cellKey(team.id, day)]}
                    locale={locale}
                    onOpen={setOpenJob}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {week.unassigned.length > 0 ? (
          <div className="rounded-lg border border-dashed p-3">
            <p className="mb-2 text-sm font-medium">
              {t("unassigned", { count: week.unassigned.length })}
            </p>
            <div className="flex flex-wrap gap-2">
              {week.unassigned.map((job) => (
                <div key={job.id} className="w-48">
                  <JobBlock job={job} locale={locale} onOpen={setOpenJob} />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DragOverlay>
          {activeJob ? (
            <div className="w-40">
              <JobBlock job={activeJob} locale={locale} overlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ConflictDialog
        open={pending !== null}
        conflicts={pending?.conflicts ?? []}
        locale={locale}
        onCancel={() => {
          setPending(null);
          router.refresh();
        }}
        onConfirm={() => {
          if (pending) save(pending.jobId, pending.teamId, pending.start, true);
        }}
      />

      <JobDetailSheet
        key={openJob?.id ?? "none"}
        job={openJob}
        locale={locale}
        onClose={() => setOpenJob(null)}
      />
    </>
  );
}

function Cell({
  teamId, date, jobs, utilisation, locale, onOpen, isToday, isWeekend,
}: {
  teamId: string;
  date: string;
  jobs: ScheduleJobCard[];
  utilisation?: {
    bookedMinutes: number; capacityMinutes: number; percent: number;
    isNonWorkingDay: boolean; isOnLeave: boolean;
  };
  locale: "en" | "ar";
  onOpen: (job: ScheduleJobCard) => void;
  isToday: boolean;
  isWeekend: boolean;
}) {
  const t = useTranslations("schedule");
  const { setNodeRef, isOver } = useDroppable({ id: cellKey(teamId, date) });

  const percent = utilisation?.percent ?? 0;
  const over = percent > 100;

  return (
    <div
      ref={setNodeRef}
      data-testid={`cell-${teamId}-${date}`}
      className={cn(
        "min-h-28 space-y-1 border-s p-1.5 transition-colors",
        isWeekend && "bg-muted/40",
        isToday && "bg-primary/5",
        isOver && "bg-accent ring-primary ring-2 ring-inset",
      )}
    >
      {utilisation && !utilisation.isNonWorkingDay ? (
        <div className="mb-1 flex items-center gap-1.5">
          <div className="bg-muted h-1 flex-1 overflow-hidden rounded-full">
            <div
              className={cn("h-full rounded-full", over ? "bg-red-500" : percent > 85 ? "bg-amber-500" : "bg-green-600")}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <span
            className={cn(
              "text-[10px] tabular-nums",
              over ? "font-medium text-red-600" : "text-muted-foreground",
            )}
          >
            {percent}%
          </span>
        </div>
      ) : null}

      {utilisation?.isOnLeave ? (
        <p className="text-muted-foreground flex items-center gap-1 text-[10px]">
          <Plane className="size-3" aria-hidden />
          {t("onLeave")}
        </p>
      ) : utilisation?.isNonWorkingDay ? (
        <p className="text-muted-foreground flex items-center gap-1 text-[10px]">
          <CalendarOff className="size-3" aria-hidden />
          {t("dayOff")}
        </p>
      ) : null}

      {jobs.map((job) => (
        <JobBlock key={job.id} job={job} locale={locale} onOpen={onOpen} />
      ))}
    </div>
  );
}
