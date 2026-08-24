"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { generateSeriesJobsAction } from "@/app/actions/schedule";

/** Week back / week forward / today, plus the "fill the diary" button. */
export function WeekNav({ weekStart, locale }: { weekStart: string; locale: "en" | "ar" }) {
  const t = useTranslations("schedule");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [generating, startGenerating] = useTransition();

  function goto(offsetWeeks: number | "today") {
    const next = new URLSearchParams(params.toString());
    if (offsetWeeks === "today") {
      next.delete("week");
    } else {
      const date = new Date(`${weekStart}T00:00:00`);
      date.setDate(date.getDate() + offsetWeeks * 7);
      next.set("week", date.toLocaleDateString("sv-SE"));
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => goto(-1)} disabled={pending} aria-label={t("previousWeek")}>
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
      </Button>
      <Button variant="outline" size="sm" onClick={() => goto("today")} disabled={pending}>
        {t("thisWeek")}
      </Button>
      <Button variant="outline" size="icon" onClick={() => goto(1)} disabled={pending} aria-label={t("nextWeek")}>
        <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
      </Button>

      {pending ? <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden /> : null}

      <Button
        variant="secondary"
        size="sm"
        className="ms-auto"
        disabled={generating}
        onClick={() =>
          startGenerating(async () => {
            const result = await generateSeriesJobsAction({ horizonDays: 60, locale });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(
              result.created === 0
                ? t("generateNothing")
                : t("generateDone", { count: result.created }),
              result.skippedForConflict > 0
                ? { description: t("generateSkipped", { count: result.skippedForConflict }) }
                : undefined,
            );
            router.refresh();
          })
        }
      >
        {generating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        {t("generate")}
      </Button>
    </div>
  );
}
