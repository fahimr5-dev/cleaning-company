import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import {
  ArrowLeft, MapPin, Navigation, PawPrint, KeyRound, TriangleAlert,
  StickyNote, ParkingCircle, LockKeyhole,
} from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getFieldJob } from "@/lib/queries/field";
import { isStorageConfigured } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClockButton, GeofenceFlag } from "@/components/field/clock-button";
import { FieldChecklist } from "@/components/field/checklist";
import { PhotoUpload } from "@/components/field/photo-upload";
import { ReportIssue } from "@/components/field/report-issue";
import { CompleteJob } from "@/components/field/complete-job";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string; jobId: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "field" });
  return { title: t("title") };
}

export default async function FieldJobPage({
  params,
}: {
  params: Promise<{ locale: string; jobId: string }>;
}) {
  const { locale, jobId } = await params;
  setRequestLocale(locale);

  const user = await requireRole(locale, "CLEANER");
  if (!user.staffId) notFound();
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) notFound();

  const job = await getFieldJob(user.id, user.staffId, jobId);
  // Null means the database refused it — either it does not exist or it is not
  // this cleaner's. The same answer to both, deliberately.
  if (!job) notFound();

  const t = await getTranslations("field");
  const tStatus = await getTranslations("jobStatus");
  const isArabic = locale === "ar";
  const loc = isArabic ? ("ar" as const) : ("en" as const);

  const timeFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    hour: "2-digit", minute: "2-digit",
  });
  const service = isArabic ? job.serviceNameAr : job.serviceNameEn;
  const closed = job.status === "COMPLETED" || job.status === "CANCELLED";

  const notes: [typeof StickyNote, string, string | null][] = [
    [LockKeyhole, t("access.gateCode"), job.gateCode],
    [StickyNote, t("access.notes"), job.accessNotes],
    [ParkingCircle, t("access.parking"), job.parkingNotes],
    [StickyNote, t("access.clientNotes"), job.clientNotes],
  ];

  return (
    <div className="bg-muted/30 min-h-dvh">
      <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-2">
        <Button variant="ghost" size="sm" render={<Link href={`/${locale}/field`} />}>
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("back")}
        </Button>
        <Badge variant="secondary" className="ms-auto me-2">{tStatus(job.status)}</Badge>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4 pb-24">
        {/* Who and where */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-lg font-semibold">{job.clientName}</p>
              <p className="text-muted-foreground text-sm">{service}</p>
              <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                {timeFmt.format(new Date(job.start))} – {timeFmt.format(new Date(job.end))}
                {" · "}
                {t("minutes", { count: job.durationMinutes })}
              </p>
            </div>

            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{job.addressLine}</span>
            </p>

            {job.mapsUrl ? (
              <Button
                className="h-12 w-full"
                render={<a href={job.mapsUrl} target="_blank" rel="noopener noreferrer" />}
              >
                <Navigation className="size-4" aria-hidden />
                {t("directions")}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {/* The warnings that matter before you knock */}
        {job.chemicalAllergies || job.hasPets || job.keyHeldByCompany ? (
          <div className="space-y-2">
            {job.chemicalAllergies ? (
              <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span><strong>{t("allergy")}:</strong> {job.chemicalAllergies}</span>
              </p>
            ) : null}
            {job.hasPets ? (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                <PawPrint className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{job.petNotes ?? t("pets")}</span>
              </p>
            ) : null}
            {job.keyHeldByCompany ? (
              <p className="bg-card flex items-start gap-2 rounded-lg border p-3 text-sm">
                <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{t("keyHeld")}{job.keyTag ? ` — ${job.keyTag}` : ""}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Getting in */}
        {notes.some(([, , value]) => value) ? (
          <Card>
            <CardContent className="space-y-2.5 p-4">
              {notes.filter(([, , value]) => value).map(([Icon, label, value]) => (
                <div key={label} className="flex items-start gap-2 text-sm">
                  <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="text-muted-foreground">{label}: </span>
                    {label === t("access.gateCode") ? (
                      <span className="font-mono text-base font-semibold tracking-widest" dir="ltr">{value}</span>
                    ) : value}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {/* Clocking in and out */}
        <Card>
          <CardContent className="space-y-2 p-4">
            <ClockButton jobId={job.id} state={job.clockState} locale={loc} />
            {job.clockInFlagged ? <GeofenceFlag distanceMetres={job.clockInDistanceM} /> : null}
            {job.clockInAt ? (
              <p className="text-muted-foreground text-center text-xs tabular-nums">
                {t("clock.startedAt", { time: timeFmt.format(new Date(job.clockInAt)) })}
                {job.clockOutAt ? ` · ${t("clock.endedAt", { time: timeFmt.format(new Date(job.clockOutAt)) })}` : ""}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* The checklist */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 font-medium">{t("checklist.title")}</h2>
            <FieldChecklist
              jobId={job.id}
              items={job.checklist}
              locale={loc}
              readOnly={closed}
            />
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardContent className="p-4">
            <h2 className="mb-3 font-medium">{t("photos.title")}</h2>
            <PhotoUpload
              jobId={job.id}
              photos={job.photos}
              locale={loc}
              storageReady={isStorageConfigured()}
              readOnly={closed}
            />
          </CardContent>
        </Card>

        {/* Finishing, and reporting a problem */}
        {!closed ? (
          <div className="space-y-3">
            <CompleteJob
              jobId={job.id}
              locale={loc}
              outstandingMandatory={job.mandatoryOutstanding}
              photoCount={job.photoCount}
              canFinish={job.clockState !== "NOT_CLOCKED_IN"}
            />
            <ReportIssue jobId={job.id} locale={loc} />
          </div>
        ) : (
          <ReportIssue jobId={job.id} locale={loc} />
        )}
      </main>
    </div>
  );
}
