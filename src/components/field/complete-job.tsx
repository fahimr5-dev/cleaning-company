"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { completeJobAction } from "@/app/actions/field";

/**
 * The finish button.
 *
 * It is disabled while required checklist items are outstanding, AND the server
 * refuses independently — so the rule holds even if somebody re-enables the
 * button in their browser.
 */
export function CompleteJob({
  jobId, locale, outstandingMandatory, photoCount, canFinish,
}: {
  jobId: string;
  locale: "en" | "ar";
  outstandingMandatory: number;
  photoCount: number;
  canFinish: boolean;
}) {
  const t = useTranslations("field.complete");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  const blocked = outstandingMandatory > 0;

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        data-testid="complete-job"
        className="h-14 w-full text-base"
        disabled={busy || blocked || !canFinish}
        onClick={() =>
          startBusy(async () => {
            const result = await completeJobAction({ jobId, locale });
            if (result.ok) {
              toast.success(t("done"), {
                description: result.warning === "NO_PHOTOS" ? t("noPhotosWarning") : undefined,
              });
              router.refresh();
            } else {
              toast.error(result.error);
            }
          })
        }
      >
        {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <CheckCircle2 className="size-5" aria-hidden />}
        {t("finish")}
      </Button>

      {blocked ? (
        <p className="text-center text-xs text-amber-700 dark:text-amber-400">
          {t("blocked", { count: outstandingMandatory })}
        </p>
      ) : !canFinish ? (
        <p className="text-muted-foreground text-center text-xs">{t("clockInFirst")}</p>
      ) : photoCount === 0 ? (
        <p className="text-muted-foreground text-center text-xs">{t("noPhotosYet")}</p>
      ) : null}
    </div>
  );
}
