import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  CalendarCheck, Users, UserPlus, Wallet, TicketCheck, MapPinOff,
  IdCard, AlertCircle, PackageOpen, Info,
} from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/common/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("title") };
}

const STATUS_TONE: Record<string, string> = {
  SCHEDULED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  EN_ROUTE: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  NO_ACCESS: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireRole(locale, ...OFFICE_ROLES);
  const data = await getDashboardData();
  const t = await getTranslations("dashboard");
  const tStatus = await getTranslations("jobStatus");
  const isArabic = locale === "ar";
  const isOwner = user.role === "OWNER";

  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    weekday: "long", day: "numeric", month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    hour: "2-digit", minute: "2-digit",
  });
  const dayFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short",
  });
  const isToday = (d: Date) =>
    d.getFullYear() === data.today.getFullYear() &&
    d.getMonth() === data.today.getMonth() &&
    d.getDate() === data.today.getDate();
  const num = new Intl.NumberFormat(locale === "ar" ? "ar-AE" : "en-AE");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("welcome", { name: user.fullName.split(" ")[0] })}
        </p>
      </div>

      {/* Honest about where the build has got to. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t("phaseNotice")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarCheck}
          label={t("jobsToday")}
          value={num.format(data.jobsToday)}
          hint={t("jobsTodayHint", { date: dateFmt.format(data.today) })}
        />
        <StatCard
          icon={Users}
          label={t("activeClients")}
          value={num.format(data.activeClients)}
          hint={t("activeClientsHint", {
            commercial: num.format(data.commercialClients),
            residential: num.format(data.residentialClients),
          })}
        />
        <StatCard
          icon={UserPlus}
          label={t("openLeads")}
          value={num.format(data.openLeads)}
          hint={t("openLeadsHint")}
        />
        {/* Money is owner-only, matching the database rules exactly. */}
        {isOwner ? (
          <StatCard
            icon={Wallet}
            label={t("outstanding")}
            value={formatMoney(data.outstandingFils, locale === "ar" ? "ar" : "en")}
            hint={t("outstandingHint", { count: num.format(data.unpaidInvoices) })}
            tone={data.outstandingFils > 0 ? "warning" : "default"}
          />
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Utilisation — capacity sold against capacity available. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("utilisation")}</CardTitle>
            <p className="text-muted-foreground text-xs">{t("utilisationHint")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.utilisation.map((team) => (
              <div key={team.teamId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: team.colorHex }}
                      aria-hidden
                    />
                    {isArabic ? (team.nameAr ?? team.name) : team.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {num.format(team.percent)}%
                  </span>
                </div>
                <Progress value={Math.min(100, team.percent)} />
                <p className="text-muted-foreground text-xs tabular-nums">
                  {num.format(team.bookedMinutes)} / {num.format(team.capacityMinutes)}{" "}
                  {t("minutesUnit")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* The list of things that will bite if ignored. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("attention")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {[
              { icon: TicketCheck, label: t("openTickets"), value: data.openTickets, tone: data.openTickets > 0 },
              { icon: MapPinOff, label: t("flaggedClockIns"), value: data.flaggedClockIns, tone: data.flaggedClockIns > 0 },
              { icon: IdCard, label: t("expiringDocuments"), value: data.expiringDocuments, tone: data.expiringDocuments > 0 },
              ...(isOwner
                ? [{ icon: AlertCircle, label: t("overdueInvoices"), value: data.overdueInvoices, tone: data.overdueInvoices > 0 }]
                : []),
              { icon: PackageOpen, label: t("lowStock"), value: data.lowStockItems, tone: data.lowStockItems > 0 },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0">
                  <span className="text-muted-foreground flex min-w-0 items-center gap-2.5 text-sm">
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span
                    className={`shrink-0 text-sm font-semibold tabular-nums ${
                      row.tone ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
                    }`}
                  >
                    {num.format(row.value)}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recentJobs")}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.upcomingJobs.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t("noJobsToday")}</p>
          ) : (
            <ul className="divide-y">
              {data.upcomingJobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <span className="text-muted-foreground w-16 shrink-0 text-sm tabular-nums">
                    <span className="block">{timeFmt.format(job.scheduledStart)}</span>
                    <span className="block text-xs">
                      {isToday(job.scheduledStart)
                        ? t("todayLabel")
                        : dayFmt.format(job.scheduledStart)}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{job.clientName}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {isArabic ? job.serviceNameAr : job.serviceNameEn}
                      {(() => {
                        const zone = isArabic ? (job.zoneNameAr ?? job.zoneNameEn) : job.zoneNameEn;
                        return zone ? ` · ${zone}` : "";
                      })()}
                    </span>
                  </span>
                  {job.teamName ? (
                    <span className="text-muted-foreground hidden text-xs sm:inline">
                      {isArabic ? (job.teamNameAr ?? job.teamName) : job.teamName}
                    </span>
                  ) : null}
                  <Badge variant="secondary" className={STATUS_TONE[job.status] ?? ""}>
                    {tStatus(job.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
