"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Send, MessageCircle, CheckCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendInvoiceAction } from "@/app/actions/invoices";
import { reconcilePaymentAction, applyClientCreditAction } from "@/app/actions/payments";
import { formatMoney } from "@/lib/money";

/**
 * Emails the invoice to the client, and offers the same text as a WhatsApp
 * link — which is how most UAE clients actually receive it.
 */
export function SendInvoiceButton({
  invoiceId, locale, alreadySent,
}: {
  invoiceId: string;
  locale: "en" | "ar";
  alreadySent: boolean;
}) {
  const t = useTranslations("invoices.send");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={busy}
      data-testid="send-invoice"
      onClick={() =>
        startBusy(async () => {
          const result = await sendInvoiceAction({ invoiceId, locale });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          if (result.emailed) {
            toast.success(t("emailed"));
          } else {
            toast.warning(t("notEmailed"), { description: result.problem ?? undefined });
          }
          if (result.whatsappUrl) {
            const url = result.whatsappUrl;
            toast(t("whatsappReady"), {
              action: {
                label: t("openWhatsapp"),
                onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
              },
              icon: <MessageCircle className="size-4" aria-hidden />,
            });
          }
          router.refresh();
        })
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
      {alreadySent ? t("resend") : t("send")}
    </Button>
  );
}

/** Ticks off a payment against the bank statement, so the books can be trusted. */
export function ReconcileButton({
  paymentId, locale,
}: {
  paymentId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("invoices.payments");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      onClick={() =>
        startBusy(async () => {
          const result = await reconcilePaymentAction({ paymentId, locale });
          if (result.ok) {
            toast.success(t("reconciled"));
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCheck className="size-4" aria-hidden />}
      {t("reconcile")}
    </Button>
  );
}

/** Spends a client's account credit against whatever they still owe. */
export function ApplyCreditButton({
  clientId, creditFils, locale,
}: {
  clientId: string;
  creditFils: number;
  locale: "en" | "ar";
}) {
  const t = useTranslations("invoices.credit");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      data-testid="apply-credit"
      onClick={() =>
        startBusy(async () => {
          const result = await applyClientCreditAction({ clientId, locale });
          if (result.ok) {
            toast.success(t("applied", { amount: formatMoney(result.appliedFils, locale) }));
            router.refresh();
          } else {
            toast.error(result.error);
          }
        })
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />}
      {t("applyButton", { amount: formatMoney(creditFils, locale) })}
    </Button>
  );
}
