import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  MapPin, Clock, PawPrint, KeyRound, TriangleAlert, ChevronRight, CheckCircle2, Camera,
} from "lucide-react";
import type { FieldJobSummary } from "@/lib/field-shared";
import { cn } from "@/lib/utils";

/** One job in the cleaner's day. Big tap targets, everything above the fold. */
export async function FieldJobCard({
  job, locale,
}: {
  job: FieldJobSummary;
  locale: "en" | "ar";
}) {
  const t = await getTranslations("field");
  const tStatus = await getTranslations("jobStatus");

  const timeFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    hour: "2-digit", minute: "2-digit",
  });
  const service = locale === "ar" ? job.serviceNameAr : job.serviceNameEn;
  const zone = locale === "ar" ? (job.zoneNameAr ?? job.zoneNameEn) : job.zoneNameEn;

  const done = job.status === "COMPLETED";
  const blocked = job.status === "NO_ACCESS" || job.status === "CANCELLED";

  return (
    <Link
      href={`/${locale}/field/${job.id}`}
      data-testid="field-job"
      data-status={job.status}
      data-clock={job.clockState}
      className={cn(
        "bg-card block rounded-xl border p-4 shadow-xs transition-colors active:bg-accent",
        done && "opacity-70",
        job.clockState === "CLOCKED_IN" && "border-amber-400 dark:border-amber-600",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold tabular-nums">{timeFmt.format(new Date(job.start))}</span>
            {job.clockState === "CLOCKED_IN" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {t("onSite")}
              </span>
            ) : null}
            {done ? <CheckCircle2 className="size-4 text-green-600" aria-label={tStatus("COMPLETED")} /> : null}
            {blocked ? (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-900 dark:bg-orange-950 dark:text-orange-200">
                {tStatus(job.status)}
              </span>
            ) : null}
          </div>

          <p className="mt-0.5 truncate font-medium">{job.clientName}</p>
          <p className="text-muted-foreground truncate text-sm">{service}</p>

          <p className="text-muted-foreground mt-1.5 flex items-start gap-1.5 text-sm">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              {job.propertyLabel}
              {/* Only add the area if the label does not already say it. */}
              {zone && !job.propertyLabel.toLowerCase().includes(zone.toLowerCase())
                ? ` · ${zone}`
                : ""}
            </span>
          </p>

          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
            <Clock className="size-3.5" aria-hidden />
            {t("minutes", { count: job.durationMinutes })}
            {job.checklistTotal > 0 ? (
              <>
                {" · "}
                <span className={cn(job.mandatoryOutstanding > 0 && "text-amber-700 dark:text-amber-400")}>
                  {t("checklistProgress", { done: job.checklistChecked, total: job.checklistTotal })}
                </span>
              </>
            ) : null}
            {job.photoCount > 0 ? (
              <>
                {" · "}
                <span className="flex items-center gap-1">
                  <Camera className="size-3" aria-hidden />
                  {job.photoCount}
                </span>
              </>
            ) : null}
          </p>

          {/* The three things that ruin a visit if you find out on the doorstep. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.chemicalAllergies ? (
              <span className="flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950 dark:text-red-200">
                <TriangleAlert className="size-3" aria-hidden />
                {t("allergy")}
              </span>
            ) : null}
            {job.hasPets ? (
              <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <PawPrint className="size-3" aria-hidden />
                {t("pets")}
              </span>
            ) : null}
            {job.keyHeldByCompany ? (
              <span className="bg-muted flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]">
                <KeyRound className="size-3" aria-hidden />
                {job.keyTag ?? t("keyHeld")}
              </span>
            ) : null}
          </div>
        </div>

        <ChevronRight className="text-muted-foreground mt-1 size-5 shrink-0 rtl:rotate-180" aria-hidden />
      </div>
    </Link>
  );
}
