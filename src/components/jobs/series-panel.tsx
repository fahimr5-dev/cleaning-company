"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, Pause, Play, Repeat, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { setSeriesStatusAction } from "@/app/actions/schedule";
import type { SeriesRow } from "@/lib/queries/jobs";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * The repeating bookings, and the switch to pause one.
 *
 * PLAIN ENGLISH: pausing stops new visits being generated but leaves the ones
 * already in the diary alone — the client keeps this month's cleans and simply
 * gets no new ones after that.
 */
export function SeriesPanel({ series, locale }: { series: SeriesRow[]; locale: "en" | "ar" }) {
  const t = useTranslations("jobs.series");
  const tf = useTranslations("frequency");
  const td = useTranslations("weekdayShort");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  if (series.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Repeat className="size-4" aria-hidden />
            {t("title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground pb-6 text-center text-sm">
          {t("none")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="size-4" aria-hidden />
          {t("title", { count: series.length })}
        </CardTitle>
        <p className="text-muted-foreground text-xs">{t("explain")}</p>
      </CardHeader>

      <CardContent>
        <ul className="divide-y">
          {series.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/${locale}/clients/${s.clientId}`} className="text-sm font-medium hover:underline">
                  {s.clientName}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {locale === "ar" ? s.serviceNameAr : s.serviceNameEn}
                  {" · "}
                  {tf(s.frequency)}
                  {s.daysOfWeek.length > 0
                    ? ` · ${s.daysOfWeek.map((d) => td(DAY_KEYS[d])).join(", ")}`
                    : ""}
                  {` · ${s.timeOfDay}`}
                </p>
                {s.clientPaused ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="size-3" aria-hidden />
                    {t("clientPaused")}
                  </p>
                ) : null}
              </div>

              {s.teamName ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.teamColor ?? undefined }} aria-hidden />
                  {locale === "ar" ? (s.teamNameAr ?? s.teamName) : s.teamName}
                </span>
              ) : null}

              <span className="text-muted-foreground text-xs tabular-nums">
                {t("upcoming", { count: s.upcomingCount })}
              </span>
              <span className="text-sm tabular-nums">{formatMoney(s.priceFils, locale)}</span>

              <Badge variant={s.status === "ACTIVE" ? "secondary" : "outline"}>
                {t(`status.${s.status}`)}
              </Badge>

              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const next = s.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
                    const result = await setSeriesStatusAction({ seriesId: s.id, status: next, locale });
                    if (result.ok) {
                      toast.success(next === "PAUSED" ? t("paused") : t("resumed"));
                      router.refresh();
                    } else {
                      toast.error(result.error);
                    }
                  })
                }
              >
                {busy ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : s.status === "ACTIVE" ? (
                  <Pause className="size-3.5" aria-hidden />
                ) : (
                  <Play className="size-3.5" aria-hidden />
                )}
                {s.status === "ACTIVE" ? t("pause") : t("resume")}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
