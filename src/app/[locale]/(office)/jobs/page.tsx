import { setRequestLocale } from "next-intl/server";
import { TodoScreen } from "@/components/common/todo-screen";
import { requireRole } from "@/lib/auth";

/**
 * NOT BUILT YET — delivered in Phase 3.
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
      feature="The job list"
      phase={3}
      willInclude={[
        "Searchable list of every job with its status and full history",
        "Create, reschedule and cancel, with the late-cancellation rule applied",
        "Photos, checklist and timesheet for each completed job",
      ]}
    />
  );
}
