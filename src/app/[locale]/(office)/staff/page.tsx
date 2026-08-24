import { setRequestLocale } from "next-intl/server";
import { TodoScreen } from "@/components/common/todo-screen";
import { requireRole } from "@/lib/auth";

/**
 * NOT BUILT YET — delivered in Phase 7.
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
  await requireRole(locale, "OWNER", "OPS_MANAGER");

  return (
    <TodoScreen
      feature="Staff and HR"
      phase={7}
      willInclude={[
        "Employee profiles with visa, Emirates ID and medical fitness expiry",
        "Automatic email alerts to you at 60, 30 and 7 days before any expiry",
        "Monthly timesheet CSV export for WPS payroll",
        "Performance scorecard per cleaner: jobs, rating, complaints, punctuality",
        "Leave requests with approval, which free up capacity on the calendar",
      ]}
    />
  );
}
