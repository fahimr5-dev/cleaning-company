"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { Repeat, TriangleAlert, Users } from "lucide-react";
import { STATUS_STYLES, type ScheduleJobCard } from "@/lib/schedule-shared";
import { cn } from "@/lib/utils";

/** One job on the schedule: a draggable, colour-coded block. */
export function JobBlock({
  job, locale, onOpen, overlay,
}: {
  job: ScheduleJobCard;
  locale: "en" | "ar";
  onOpen?: (job: ScheduleJobCard) => void;
  /** True for the copy that follows the cursor while dragging. */
  overlay?: boolean;
}) {
  const t = useTranslations("schedule");
  // A finished or cancelled job is history — it must not be dragged around.
  const isLocked = job.status === "COMPLETED" || job.status === "CANCELLED";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: job.id,
    disabled: isLocked,
  });

  // Deliberately do NOT spread the drag attributes onto a locked job. They
  // include aria-disabled, which would mark everything inside the block —
  // including the button that opens it — as disabled to screen readers, so a
  // completed job could not be opened at all.
  const dragProps = overlay || isLocked ? {} : { ...attributes, ...listeners };

  const style = STATUS_STYLES[job.status];
  const service = locale === "ar" ? job.serviceNameAr : job.serviceNameEn;
  const zone = locale === "ar" ? (job.zoneNameAr ?? job.zoneNameEn) : job.zoneNameEn;
  const time = new Date(job.start).toLocaleTimeString(locale === "ar" ? "ar-AE" : "en-AE", {
    hour: "2-digit", minute: "2-digit",
  });

  const blocking = job.conflicts.filter((c) => c.severity === "BLOCK");
  const warnings = job.conflicts.filter((c) => c.severity === "WARN");

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : { transform: CSS.Translate.toString(transform) }}
      {...dragProps}
      data-testid="job-block"
      data-job-id={job.id}
      className={cn(
        "w-full rounded-md border p-1.5 text-start text-[11px] leading-tight transition-shadow",
        style.block,
        isDragging && "opacity-40",
        overlay && "rotate-1 shadow-lg",
        !isLocked && "cursor-grab active:cursor-grabbing",
        blocking.length > 0 && "ring-2 ring-red-500",
      )}
    >
      <div className="flex items-center gap-1">
        <span className="font-medium tabular-nums">{time}</span>
        {job.isRecurring ? <Repeat className="size-2.5 shrink-0 opacity-70" aria-label={t("recurring")} /> : null}
        {blocking.length > 0 ? (
          <TriangleAlert className="size-3 shrink-0 text-red-600" aria-label={t("conflict.blocking")} />
        ) : warnings.length > 0 ? (
          <TriangleAlert className="size-3 shrink-0 text-amber-600" aria-label={t("conflict.warning")} />
        ) : null}
        <span className="ms-auto flex shrink-0 items-center gap-0.5 opacity-70">
          <Users className="size-2.5" aria-hidden />
          {job.cleanersRequired}
        </span>
      </div>

      {/* A separate button so a click opens the job without starting a drag. */}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onOpen?.(job)}
        className="mt-0.5 block w-full truncate text-start font-medium hover:underline"
      >
        {job.clientName}
      </button>

      <p className="truncate opacity-80">{service}</p>
      {zone ? <p className="truncate opacity-60">{zone}</p> : null}
    </div>
  );
}
