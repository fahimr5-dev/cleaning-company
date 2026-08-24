import { setRequestLocale } from "next-intl/server";
import { TodoScreen } from "@/components/common/todo-screen";
import { requireRole } from "@/lib/auth";

/**
 * NOT BUILT YET — delivered in Phase 8.
 *
 * The role check below is real and active today: someone who is not allowed
 * here is redirected to their own home screen before this page renders. What
 * is missing is the feature itself, which is why this shows a placeholder
 * rather than an empty table pretending to be a working screen.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(locale, "OWNER");

  return (
    <TodoScreen
      feature="Reporting"
      phase={8}
      willInclude={[
        "Revenue by day, week, month, service type and area",
        "Utilisation percentage per team",
        "CAC by lead source, client lifetime value, churn and referral revenue",
        "Aged receivables at 0-30, 31-60 and 60+ days",
        "Cleaner league table, all exportable to CSV",
      ]}
    />
  );
}
