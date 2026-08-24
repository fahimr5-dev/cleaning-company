import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, Gauge, Wallet, TriangleAlert } from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getScheduleWeek } from "@/lib/queries/schedule";
import { formatMoney } from "@/lib/money";
import { ScheduleBoard } from "@/components/schedule/schedule-board";
import { WeekNav } from "@/components/schedule/week-nav";
import { StatCard } from "@/components/common/stat-card";

/**
 * The weekly schedule. Teams down the side, days across the top.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("schedule") };
}

export default async function SchedulePage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(locale, ...OFFICE_ROLES);

  const weekParam = Array.isArray(sp.week) ? sp.week[0] : sp.week;
  const anchor = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
    ? new Date(`${weekParam}T00:00:00`)
    : new Date();

  const week = await getScheduleWeek(anchor);
  const t = await getTranslations("schedule");
  const isArabic = locale === "ar";
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");

  const conflictCount = [...Object.values(week.jobsByCell).flat(), ...week.unassigned]
    .filter((j) => j.conflicts.length > 0).length;

  const rangeFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {rangeFmt.format(new Date(`${week.weekStart}T00:00:00`))} – {rangeFmt.format(new Date(`${week.weekEnd}T00:00:00`))}
          {" · "}
          {t("subtitle")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarDays} label={t("stats.jobs")} value={num.format(week.totals.jobCount)} hint={t("stats.jobsHint")} />
        <StatCard
          icon={Gauge}
          label={t("stats.utilisation")}
          value={`${num.format(week.totals.percent)}%`}
          hint={t("stats.utilisationHint", {
            booked: num.format(Math.round(week.totals.bookedMinutes / 60)),
            capacity: num.format(Math.round(week.totals.capacityMinutes / 60)),
          })}
          tone={week.totals.percent > 100 ? "danger" : week.totals.percent > 85 ? "warning" : "default"}
        />
        <StatCard
          icon={Wallet}
          label={t("stats.revenue")}
          value={formatMoney(week.totals.revenueFils, isArabic ? "ar" : "en")}
          hint={t("stats.revenueHint")}
        />
        <StatCard
          icon={TriangleAlert}
          label={t("stats.conflicts")}
          value={num.format(conflictCount)}
          hint={t("stats.conflictsHint")}
          tone={conflictCount > 0 ? "warning" : "default"}
        />
      </div>

      <WeekNav weekStart={week.weekStart} locale={isArabic ? "ar" : "en"} />

      <p className="text-muted-foreground text-xs">{t("dragHint")}</p>

      <ScheduleBoard week={week} locale={isArabic ? "ar" : "en"} />

      {/* A key, so the colours mean something without being explained. */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {(["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_ACCESS"] as const).map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${
              { SCHEDULED: "bg-slate-400", EN_ROUTE: "bg-blue-500", IN_PROGRESS: "bg-amber-500",
                COMPLETED: "bg-green-600", CANCELLED: "bg-red-500", NO_ACCESS: "bg-orange-500" }[status]
            }`} aria-hidden />
            {t(`legend.${status}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
