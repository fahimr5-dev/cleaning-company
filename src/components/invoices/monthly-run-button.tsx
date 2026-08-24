"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, CalendarClock, BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runMonthlyBillingAction, sendRemindersNowAction } from "@/app/actions/invoices";
import { formatMoney } from "@/lib/money";

/**
 * The two month-end buttons.
 *
 * PLAIN ENGLISH: "Run monthly billing" gathers last month's completed jobs for
 * clients on monthly terms into one invoice each. "Send reminders" chases every
 * overdue invoice whose reminder is due today. Both are safe to press twice —
 * nothing is invoiced or chased a second time.
 */
export function MonthlyRunButton({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("invoices.run");
  const router = useRouter();
  const [billing, startBilling] = useTransition();
  const [chasing, startChasing] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={billing}
        data-testid="run-monthly"
        onClick={() =>
          startBilling(async () => {
            const result = await runMonthlyBillingAction({ locale });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            if (result.created === 0) {
              toast.info(t("nothing"));
            } else {
              toast.success(
                t("done", {
                  count: result.created,
                  clients: result.clients,
                  total: formatMoney(result.totalFils, locale),
                }),
              );
            }
            router.refresh();
          })
        }
      >
        {billing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
        {t("monthly")}
      </Button>

      <Button
        variant="outline"
        disabled={chasing}
        data-testid="send-reminders"
        onClick={() =>
          startChasing(async () => {
            const result = await sendRemindersNowAction({ locale });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            if (result.sent === 0 && result.failed === 0) {
              toast.info(t("noReminders"));
            } else if (result.failed > 0) {
              toast.warning(t("remindersPartly", { sent: result.sent, failed: result.failed }), {
                description: result.problems[0],
              });
            } else {
              toast.success(t("remindersSent", { sent: result.sent }));
            }
            if (result.clientsPaused > 0) {
              toast.warning(t("paused", { count: result.clientsPaused }));
            }
            router.refresh();
          })
        }
      >
        {chasing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
        {t("reminders")}
      </Button>
    </div>
  );
}
