import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { IdCard, ShieldAlert, CalendarOff, Clock } from "lucide-react";
import { requireRole, OFFICE_ROLES, canSeeSalary } from "@/lib/auth";
import { getStaff, getTimesheetQueue, getPendingLeave } from "@/lib/queries/staff";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/common/stat-card";
import { ComplianceBadge } from "@/components/staff/compliance-badge";
import { LeaveDecision, TimesheetReview } from "@/components/staff/staff-actions";
import { StaffFilters } from "@/components/staff/staff-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** Auth-dependent, so it must be rendered per request and never prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("staff") };
}

export default async function StaffPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const user = await requireRole(locale, ...OFFICE_ROLES);
  const showSalary = canSeeSalary(user.role);

  const t = await getTranslations("staff");
  const isArabic = locale === "ar";
  const lang: "en" | "ar" = isArabic ? "ar" : "en";
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short",
  });
  const timeFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    hour: "numeric", minute: "2-digit",
  });

  const result = await getStaff({
    search: one(sp.q),
    status: one(sp.status),
    compliance: one(sp.compliance),
    canSeeSalary: showSalary,
  });
  const timesheets = await getTimesheetQueue();
  const leave = await getPendingLeave();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={IdCard} label={t("stats.active")} value={num.format(result.summary.active)} />
        <StatCard
          icon={ShieldAlert}
          label={t("stats.blocked")}
          value={num.format(result.summary.blocked)}
          hint={t("stats.blockedHint")}
          tone={result.summary.blocked > 0 ? "danger" : "default"}
        />
        <StatCard
          icon={CalendarOff}
          label={t("stats.expiring")}
          value={num.format(result.summary.expiringSoon)}
          hint={t("stats.expiringHint")}
          tone={result.summary.expiringSoon > 0 ? "warning" : "default"}
        />
        <StatCard
          icon={Clock}
          label={t("stats.awaitingReview")}
          value={num.format(timesheets.length)}
          hint={t("stats.awaitingReviewHint")}
          tone={timesheets.length > 0 ? "warning" : "default"}
        />
      </div>

      {/* Anything blocking work is the reason to open this screen, so it goes first. */}
      {result.summary.blocked > 0 ? (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
            <p data-testid="blocked-warning">
              {t("blockedWarning", { count: num.format(result.summary.blocked) })}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Leave waiting for a decision. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-medium">{t("leave.pendingTitle")}</h2>
            {leave.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm" data-testid="leave-empty">
                {t("leave.none")}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {leave.map((request) => (
                  <li key={request.id} className="flex items-start justify-between gap-3 py-3" data-testid="leave-row">
                    <div className="min-w-0">
                      <Link href={`/${locale}/staff/${request.staffId}`} className="font-medium hover:underline">
                        {request.staffName}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {t(`leave.types.${request.type}`)} · {num.format(request.days)}
                        {" "}
                        {t("leave.days")} · {dateFmt.format(new Date(request.startDate))}
                        {" – "}
                        {dateFmt.format(new Date(request.endDate))}
                      </p>
                      {request.type === "ANNUAL" ? (
                        <p className={`text-xs ${request.days > request.balance.remainingDays ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                          {t("leave.balance", { days: num.format(request.balance.remainingDays) })}
                        </p>
                      ) : null}
                      {request.reason ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">“{request.reason}”</p>
                      ) : null}
                    </div>
                    <LeaveDecision requestId={request.id} locale={lang} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Hours clocked away from the property. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 text-sm font-medium">{t("timesheets.title")}</h2>
            <p className="text-muted-foreground mb-3 text-xs">{t("timesheets.hint")}</p>
            {timesheets.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm" data-testid="timesheets-empty">
                {t("timesheets.none")}
              </p>
            ) : (
              <ul className="divide-y text-sm" data-testid="timesheet-list" data-queued={timesheets.length}>
                {timesheets.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-3" data-testid="timesheet-row">
                    <div className="min-w-0">
                      <Link href={`/${locale}/staff/${entry.staffId}`} className="font-medium hover:underline">
                        {entry.staffName}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {entry.jobNo ?? t("timesheets.noJob")}
                        {" · "}
                        {dateFmt.format(new Date(entry.clockInAt))}
                        {" "}
                        {timeFmt.format(new Date(entry.clockInAt))}
                        {" · "}
                        {t("timesheets.minutes", { minutes: num.format(entry.minutesWorked) })}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        {t("timesheets.distance", { metres: num.format(entry.worstDistanceM) })}
                      </p>
                    </div>
                    <TimesheetReview entryId={entry.id} locale={lang} />
                  </li>
                ))}
              </ul>
            )}
            {/* Never truncate in silence: say how many are not shown. */}
            {timesheets.length > 8 ? (
              <p className="text-muted-foreground mt-3 border-t pt-3 text-xs" data-testid="timesheet-more">
                {t("timesheets.andMore", { count: num.format(timesheets.length - 8) })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <StaffFilters total={result.total} />

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t("table.person")}</th>
                  <th className="p-3 text-start font-medium">{t("table.position")}</th>
                  <th className="p-3 text-start font-medium">{t("table.team")}</th>
                  <th className="p-3 text-start font-medium">{t("table.papers")}</th>
                  {showSalary ? <th className="p-3 text-end font-medium">{t("table.package")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((person) => (
                  <tr key={person.id} className="hover:bg-muted/40 border-t" data-testid="staff-row" data-compliance={person.complianceStatus}>
                    <td className="p-3">
                      <Link href={`/${locale}/staff/${person.id}`} className="font-medium hover:underline">
                        {person.fullName}
                      </Link>
                      <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span>{person.employeeNo}</span>
                        {person.onLeaveToday ? (
                          <Badge variant="secondary" className="text-[10px]">{t("onLeave")}</Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="text-muted-foreground p-3">{t(`positions.${person.position}`)}</td>
                    <td className="text-muted-foreground p-3">
                      {person.teamNames.length > 0 ? person.teamNames.join(", ") : "—"}
                    </td>
                    <td className="p-3">
                      <ComplianceBadge
                        status={person.complianceStatus}
                        label={
                          person.complianceStatus === "EXPIRING" && person.soonestExpiryDays !== null
                            ? t("compliance.expiringIn", { days: num.format(person.soonestExpiryDays) })
                            : t(`compliance.${person.complianceStatus}`)
                        }
                      />
                      {person.blockedFromWork ? (
                        <span className="mt-1 block text-[11px] text-red-700 dark:text-red-400">
                          {t("compliance.cannotWork")}
                        </span>
                      ) : null}
                    </td>
                    {showSalary ? (
                      <td className="p-3 text-end tabular-nums" data-testid="salary-cell">
                        {person.monthlyPackageFils === null
                          ? "—"
                          : formatMoney(person.monthlyPackageFils, lang)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y md:hidden">
            {result.rows.map((person) => (
              <li key={person.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/${locale}/staff/${person.id}`} className="font-medium hover:underline">
                    {person.fullName}
                  </Link>
                  <ComplianceBadge
                    status={person.complianceStatus}
                    label={t(`compliance.${person.complianceStatus}`)}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {person.employeeNo} · {t(`positions.${person.position}`)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
