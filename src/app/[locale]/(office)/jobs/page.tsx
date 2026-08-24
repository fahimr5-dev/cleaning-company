import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarClock, CheckCircle2, XCircle, Wallet, Repeat } from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getJobs, getRecurringSeries } from "@/lib/queries/jobs";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { JobFilters } from "@/components/jobs/job-filters";
import { SeriesPanel } from "@/components/jobs/series-panel";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("jobs") };
}

export default async function JobsPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(locale, ...OFFICE_ROLES);

  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const when = (one(sp.when) ?? "UPCOMING") as "UPCOMING" | "PAST" | "ALL";

  const [result, series, teams] = await Promise.all([
    getJobs({
      search: one(sp.q),
      status: one(sp.status),
      teamId: one(sp.teamId),
      when,
      page: Number(one(sp.page) ?? "1") || 1,
    }),
    getRecurringSeries(),
    prisma.team.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameAr: true },
    }),
  ]);

  const t = await getTranslations("jobs");
  const tStatus = await getTranslations("jobStatus");
  const isArabic = locale === "ar";
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const money = (fils: number) => formatMoney(fils, isArabic ? "ar" : "en");
  const dtFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const STATUS_TONE: Record<string, string> = {
    SCHEDULED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    EN_ROUTE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    COMPLETED: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    CANCELLED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    NO_ACCESS: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  };

  const totalPages = Math.ceil(result.total / result.pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarClock} label={t("stats.upcoming")} value={num.format(result.summary.upcoming)} hint={t("stats.upcomingHint")} />
        <StatCard icon={CheckCircle2} label={t("stats.completed")} value={num.format(result.summary.completedThisMonth)} hint={t("stats.thisMonth")} />
        <StatCard
          icon={XCircle}
          label={t("stats.cancelled")}
          value={num.format(result.summary.cancelledThisMonth)}
          hint={t("stats.thisMonth")}
          tone={result.summary.cancelledThisMonth > 0 ? "warning" : "default"}
        />
        <StatCard icon={Wallet} label={t("stats.revenue")} value={money(result.summary.revenueThisMonthFils)} hint={t("stats.revenueHint")} />
      </div>

      <SeriesPanel series={series} locale={isArabic ? "ar" : "en"} />

      <JobFilters teams={teams} total={result.total} />

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">{t("empty")}</CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t("table.job")}</th>
                  <th className="p-3 text-start font-medium">{t("table.client")}</th>
                  <th className="p-3 text-start font-medium">{t("table.service")}</th>
                  <th className="p-3 text-start font-medium">{t("table.team")}</th>
                  <th className="p-3 text-start font-medium">{t("table.when")}</th>
                  <th className="p-3 text-end font-medium">{t("table.price")}</th>
                  <th className="p-3 text-start font-medium">{t("table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40 border-t">
                    <td className="p-3">
                      <span className="flex items-center gap-1.5 font-mono text-xs" dir="ltr">
                        {row.jobNo}
                        {row.isRecurring ? <Repeat className="text-muted-foreground size-3" aria-label={t("recurring")} /> : null}
                      </span>
                    </td>
                    <td className="p-3">
                      <Link href={`/${locale}/clients/${row.clientId}`} className="hover:underline">
                        {row.clientName}
                      </Link>
                      {row.zoneNameEn ? (
                        <span className="text-muted-foreground block text-xs">
                          {isArabic ? (row.zoneNameAr ?? row.zoneNameEn) : row.zoneNameEn}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3">{isArabic ? row.serviceNameAr : row.serviceNameEn}</td>
                    <td className="p-3">
                      {row.teamName ? (
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full" style={{ backgroundColor: row.teamColor ?? undefined }} aria-hidden />
                          {isArabic ? (row.teamNameAr ?? row.teamName) : row.teamName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("unassigned")}</span>
                      )}
                    </td>
                    <td className="text-muted-foreground p-3 text-xs tabular-nums">
                      {dtFmt.format(new Date(row.scheduledStart))}
                    </td>
                    <td className="p-3 text-end tabular-nums">
                      {money(row.totalFils)}
                      {row.lateCancellationFeeFils > 0 ? (
                        <span className="block text-xs text-amber-700 dark:text-amber-400">
                          {t("lateFee", { fee: money(row.lateCancellationFeeFils) })}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className={STATUS_TONE[row.status] ?? ""}>
                        {tStatus(row.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {t("pageOf", { page: num.format(result.page), total: num.format(totalPages) })}
          </p>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Button variant="outline" size="sm" render={<Link href={{ query: { ...sp, page: result.page - 1 } }} />}>
                {t("previous")}
              </Button>
            ) : null}
            {result.page < totalPages ? (
              <Button variant="outline" size="sm" render={<Link href={{ query: { ...sp, page: result.page + 1 } }} />}>
                {t("next")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
