import { setRequestLocale } from "next-intl/server";
import { TodoScreen } from "@/components/common/todo-screen";
import { requireRole } from "@/lib/auth";

/**
 * NOT BUILT YET — delivered in Phase 5.
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
      feature="Invoicing and payments"
      phase={5}
      willInclude={[
        "VAT invoices with your TRN, a 5% VAT line and sequential numbering",
        "Auto-invoice on job completion, or one consolidated monthly invoice",
        "Stripe payment link, plus manual recording of cash and bank transfers",
        "Dunning reminders on the due date, +3 days and +7 days",
        "Credit notes and refunds with a full audit trail",
        "Prepaid packages that decrement automatically per completed job",
      ]}
    />
  );
}
