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
      feature="Settings"
      phase={8}
      willInclude={[
        "Rate card editor: every price the quote calculator uses, editable by you",
        "Company details, TRN, VAT rate and which days are your weekend",
        "Checklist template editor per service type",
        "Email and WhatsApp message templates in English and Arabic",
      ]}
    />
  );
}
