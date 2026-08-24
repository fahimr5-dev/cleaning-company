import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Sparkles, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getFieldDay } from "@/lib/queries/field";
import { FieldJobCard } from "@/components/field/job-card";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { UserMenu } from "@/components/shell/user-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * The cleaner's day.
 *
 * Everything here is read through the RLS-enforced connection, so the database
 * itself only hands over this cleaner's team's jobs.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "field" });
  return { title: t("title") };
}

export default async function FieldPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const user = await requireRole(locale, "CLEANER");
  const t = await getTranslations("field");
  const isArabic = locale === "ar";

  const dayParam = Array.isArray(sp.day) ? sp.day[0] : sp.day;
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)
    ? new Date(`${dayParam}T00:00:00`)
    : new Date();

  // A login with no employee record cannot have any jobs — say so plainly
  // rather than showing an empty list that looks like a quiet day.
  if (!user.staffId) {
    return (
      <Shell locale={locale} user={user} title={t("title")} greeting="">
        <Alert variant="destructive">
          <AlertDescription>{t("noStaffRecord")}</AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const jobs = await getFieldDay(user.id, user.staffId, day);

  const done = jobs.filter((j) => j.status === "COMPLETED").length;
  const minutes = jobs
    .filter((j) => j.status !== "CANCELLED")
    .reduce((total, j) => total + j.durationMinutes, 0);

  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <Shell
      locale={locale}
      user={user}
      title={t("title")}
      greeting={t("greeting", { name: user.fullName.split(" ")[0] })}
    >
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CalendarDays className="size-4" aria-hidden />
        {dateFmt.format(day)}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <Tile icon={CalendarDays} value={String(jobs.length)} label={t("summary.jobs")} />
        <Tile icon={CheckCircle2} value={String(done)} label={t("summary.done")} />
        <Tile icon={Clock} value={`${Math.round(minutes / 60)}h`} label={t("summary.hours")} />
      </div>

      {jobs.length === 0 ? (
        <p className="text-muted-foreground py-16 text-center text-sm">{t("noJobs")}</p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <li key={job.id}>
              <FieldJobCard job={job} locale={isArabic ? "ar" : "en"} />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

async function Shell({
  locale, user, title, greeting, children,
}: {
  locale: string;
  user: { fullName: string; email: string; role: "OWNER" | "OPS_MANAGER" | "CLEANER" | "CLIENT"; id: string; locale: "EN" | "AR"; avatarUrl: string | null; staffId: string | null; clientId: string | null };
  title: string;
  greeting: string;
  children: React.ReactNode;
}) {
  const tApp = await getTranslations("app");
  return (
    <div className="bg-muted/30 min-h-dvh">
      <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4">
        <Sparkles className="text-primary size-5" aria-hidden />
        <span className="font-semibold">{tApp("name")}</span>
        <div className="ms-auto flex items-center gap-1">
          <LocaleSwitcher current={locale} />
          <UserMenu user={user} locale={locale} />
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4 pb-16">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {greeting ? <p className="text-muted-foreground text-sm">{greeting}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}

function Tile({
  icon: Icon, value, label,
}: {
  icon: typeof CalendarDays;
  value: string;
  label: string;
}) {
  return (
    <div className="bg-card rounded-xl border p-3 text-center">
      <Icon className="text-muted-foreground mx-auto size-4" aria-hidden />
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-[11px]">{label}</p>
    </div>
  );
}
