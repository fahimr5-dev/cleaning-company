"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, Repeat, SkipForward, XCircle, ExternalLink, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatMoney } from "@/lib/money";
import type { ScheduleJobCard } from "@/lib/schedule-shared";
import {
  cancelJobAction, skipOccurrenceAction, previewCancellationAction, type CancelPreview,
} from "@/app/actions/schedule";

/** The panel for one job: what it is, and the two ways to call it off. */
export function JobDetailSheet({
  job, locale, onClose,
}: {
  job: ScheduleJobCard | null;
  locale: "en" | "ar";
  onClose: () => void;
}) {
  const t = useTranslations("schedule.detail");
  const tStatus = useTranslations("jobStatus");
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<CancelPreview | null>(null);
  const [busy, startBusy] = useTransition();

  if (!job) return null;

  const start = new Date(job.start);
  const end = new Date(job.end);
  const fmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  });
  const timeFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", {
    hour: "2-digit", minute: "2-digit",
  });

  const service = locale === "ar" ? job.serviceNameAr : job.serviceNameEn;
  const zone = locale === "ar" ? (job.zoneNameAr ?? job.zoneNameEn) : job.zoneNameEn;
  const canCancel = job.status !== "COMPLETED" && job.status !== "CANCELLED";

  const loadPreview = () =>
    startBusy(async () => {
      setPreview(await previewCancellationAction(job.id, locale));
    });

  const rows: [string, string | null][] = [
    [t("jobNo"), job.jobNo],
    [t("when"), `${fmt.format(start)} – ${timeFmt.format(end)}`],
    [t("duration"), t("minutes", { count: job.durationMinutes })],
    [t("service"), service],
    [t("area"), zone],
    [t("cleaners"), String(job.cleanersRequired)],
    [t("price"), formatMoney(job.totalFils, locale)],
  ];

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side={locale === "ar" ? "left" : "right"} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {job.clientName}
            <Badge variant="secondary">{tStatus(job.status)}</Badge>
            {job.isRecurring ? (
              <Badge variant="outline" className="gap-1">
                <Repeat className="size-3" aria-hidden />
                {t("recurring")}
              </Badge>
            ) : null}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 p-4">
          {job.conflicts.length > 0 ? (
            <Alert variant={job.conflicts.some((c) => c.severity === "BLOCK") ? "destructive" : "default"}>
              <TriangleAlert className="size-4" aria-hidden />
              <AlertDescription>
                {t("hasConflicts", { count: job.conflicts.length })}
              </AlertDescription>
            </Alert>
          ) : null}

          <dl className="space-y-2 text-sm">
            {rows.filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">{label}</dt>
                <dd className="min-w-0 text-end">{value}</dd>
              </div>
            ))}
          </dl>

          <Button variant="outline" className="w-full" render={<Link href={`/${locale}/clients/${job.clientId}`} />}>
            <ExternalLink className="size-4" aria-hidden />
            {t("viewClient")}
          </Button>

          {canCancel ? (
            <div className="space-y-3 border-t pt-4">
              {/* Skipping one visit of a series, without touching the series. */}
              {job.isRecurring ? (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={busy || job.status !== "SCHEDULED"}
                  onClick={() =>
                    startBusy(async () => {
                      const result = await skipOccurrenceAction({ jobId: job.id, locale });
                      if (result.ok) {
                        toast.success(t("skipped"));
                        onClose();
                        router.refresh();
                      } else {
                        toast.error(result.error);
                      }
                    })
                  }
                >
                  <SkipForward className="size-4" aria-hidden />
                  {t("skipThisVisit")}
                </Button>
              ) : null}

              <div>
                <Label htmlFor="cancel-reason">{t("cancelReason")}</Label>
                <Input
                  id="cancel-reason"
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (!preview) loadPreview();
                  }}
                  maxLength={500}
                  className="mt-1.5"
                  placeholder={t("cancelReasonPlaceholder")}
                />
              </div>

              {/* The cost is shown BEFORE confirming, never after. */}
              {preview?.isLate ? (
                <Alert>
                  <TriangleAlert className="size-4" aria-hidden />
                  <AlertDescription>
                    {preview.feeFils > 0
                      ? t("lateWithFee", {
                          hours: preview.hoursNotice,
                          fee: formatMoney(preview.feeFils, locale),
                        })
                      : t("lateNoFee", { hours: preview.hoursNotice })}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={busy || !reason.trim()}
                  onClick={() =>
                    startBusy(async () => {
                      const result = await cancelJobAction({ jobId: job.id, reason, scope: "THIS", locale });
                      if (result.ok) {
                        toast.success(t("cancelled"));
                        onClose();
                        router.refresh();
                      } else {
                        toast.error(result.error);
                      }
                    })
                  }
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
                  {t("cancelThis")}
                </Button>

                {job.isRecurring ? (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      startBusy(async () => {
                        const result = await cancelJobAction({ jobId: job.id, reason, scope: "SERIES", locale });
                        if (result.ok) {
                          toast.success(t("seriesEnded"));
                          onClose();
                          router.refresh();
                        } else {
                          toast.error(result.error);
                        }
                      })
                    }
                  >
                    {t("endSeries")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
