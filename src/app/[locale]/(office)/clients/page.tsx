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
      feature="Clients"
      phase={2}
      willInclude={[
        "Client list with properties, access notes, pets and allergies",
        "Per-client billing mode: invoice per job, or monthly consolidated",
        "Referral code per client, and the revenue each referral produced",
        "Churn-risk flags and the Clients at Risk list",
      ]}
    />
  );
}
