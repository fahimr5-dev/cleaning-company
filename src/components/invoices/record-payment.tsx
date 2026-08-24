"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Banknote, CreditCard, Link2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordPaymentAction, createPaymentLinkAction } from "@/app/actions/payments";
import { formatMoney, toAed, aed } from "@/lib/money";

const METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE", "CARD_STRIPE"] as const;

/**
 * Recording money that arrived outside Stripe, and creating the card link.
 *
 * PLAIN ENGLISH: most UAE cleaning invoices are settled in cash on the doorstep
 * or by bank transfer, so that path is the primary one here — the card link is
 * offered alongside it, not instead of it.
 */
export function RecordPayment({
  invoiceId, balanceFils, locale, stripeReady, hasPayLink, payUrl,
}: {
  invoiceId: string;
  balanceFils: number;
  locale: "en" | "ar";
  stripeReady: boolean;
  hasPayLink: boolean;
  payUrl: string | null;
}) {
  const t = useTranslations("invoices.record");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]>("CASH");
  // Shown in dirhams because that is what a person types; converted to fils
  // the moment it is submitted.
  const [amount, setAmount] = useState(String(toAed(balanceFils).toFixed(2)));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, startBusy] = useTransition();
  const [linking, startLinking] = useTransition();

  const amountFils = aed(Number(amount) || 0);
  const overpaying = amountFils > balanceFils;

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button />}>
          <Banknote className="size-4" aria-hidden />
          {t("button")}
        </DialogTrigger>

        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>
              {t("outstanding", { amount: formatMoney(balanceFils, locale) })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-2 block">{t("method")}</Label>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={method === value}
                    onClick={() => setMethod(value)}
                    className={
                      method === value
                        ? "border-primary bg-primary text-primary-foreground rounded-lg border px-3 py-2.5 text-sm"
                        : "hover:bg-accent rounded-lg border px-3 py-2.5 text-sm"
                    }
                  >
                    {t(`methods.${value}`)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="pay-amount">{t("amount")}</Label>
              <Input
                id="pay-amount"
                type="number"
                step="0.01"
                min="0.01"
                dir="ltr"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1.5 tabular-nums"
              />
              {overpaying ? (
                <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                  {t("overpayWarning", {
                    extra: formatMoney(amountFils - balanceFils, locale),
                  })}
                </p>
              ) : null}
            </div>

            <div>
              <Label htmlFor="pay-ref">{t("reference")}</Label>
              <Input
                id="pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={120}
                className="mt-1.5"
                placeholder={t("referencePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="pay-notes">{t("notes")}</Label>
              <Textarea
                id="pay-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button
              disabled={busy || amountFils <= 0}
              onClick={() =>
                startBusy(async () => {
                  const result = await recordPaymentAction({
                    invoiceId, method, amountFils, reference, notes, locale,
                  });
                  if (result.ok) {
                    toast.success(t("saved", { paymentNo: result.paymentNo }));
                    setOpen(false);
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {hasPayLink && payUrl ? (
        <Button variant="outline" render={<a href={payUrl} target="_blank" rel="noopener noreferrer" />}>
          <Link2 className="size-4" aria-hidden />
          {t("openPayLink")}
        </Button>
      ) : (
        <Button
          variant="outline"
          disabled={linking || !stripeReady}
          title={stripeReady ? undefined : t("stripeOff")}
          onClick={() =>
            startLinking(async () => {
              const result = await createPaymentLinkAction({ invoiceId, locale });
              if (result.ok) {
                toast.success(t("linkCreated"));
                router.refresh();
              } else {
                toast.error(result.error);
              }
            })
          }
        >
          {linking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CreditCard className="size-4" aria-hidden />}
          {t("createPayLink")}
        </Button>
      )}
    </div>
  );
}
