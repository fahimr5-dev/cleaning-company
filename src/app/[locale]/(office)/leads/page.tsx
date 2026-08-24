import { setRequestLocale } from "next-intl/server";
import { TodoScreen } from "@/components/common/todo-screen";
import { requireRole } from "@/lib/auth";

/**
 * NOT BUILT YET — delivered in Phase 2.
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
      feature="Leads pipeline"
      phase={2}
      willInclude={[
        "Kanban board: New → Contacted → Quoted → Won → Lost",
        "Lost-reason dropdown so you can analyse why deals die",
        "Lead source tracking that feeds the CAC report",
        "Auto-response by email and WhatsApp within 60 seconds, with the quote PDF",
      ]}
    />
  );
}
