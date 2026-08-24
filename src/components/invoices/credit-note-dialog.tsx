"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createCreditNoteAction } from "@/app/actions/payments";
import { formatMoney, toAed, aed } from "@/lib/money";

/**
 * Raising a credit note.
 *
 * PLAIN ENGLISH: you never delete a tax invoice — you issue a credit note
 * against it. That leaves a trail an auditor can follow, which is the point.
 */
export function CreditNoteDialog({
  invoiceId, maxCreditableFils, hasCardPayment, locale,
}: {
  invoiceId: string;
  maxCreditableFils: number;
  hasCardPayment: boolean;
  locale: "en" | "ar";
}) {
  const t = useTranslations("invoices.credit");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(toAed(maxCreditableFils).toFixed(2)));
  const [reason, setReason] = useState("");
  const [refundToCard, setRefundToCard] = useState(false);
  const [busy, startBusy] = useTransition();

  const amountFils = aed(Number(amount) || 0);
  const tooMuch = amountFils > maxCreditableFils;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <ReceiptText className="size-4" aria-hidden />
        {t("button")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="credit-amount">{t("amount")}</Label>
            <Input
              id="credit-amount"
              type="number"
              step="0.01"
              min="0.01"
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1.5 tabular-nums"
            />
            <p className="text-muted-foreground mt-1.5 text-xs">
              {t("max", { amount: formatMoney(maxCreditableFils, locale) })}
            </p>
            {tooMuch ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">{t("tooMuch")}</p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="credit-reason">{t("reason")}</Label>
            <Textarea
              id="credit-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1.5"
              placeholder={t("reasonPlaceholder")}
            />
          </div>

          {hasCardPayment ? (
            <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={refundToCard}
                onChange={(e) => setRefundToCard(e.target.checked)}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-medium">{t("refundToCard")}</span>
                <span className="text-muted-foreground block text-xs">{t("refundHint")}</span>
              </span>
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button
            variant="destructive"
            disabled={busy || tooMuch || amountFils <= 0 || reason.trim().length < 3}
            onClick={() =>
              startBusy(async () => {
                const result = await createCreditNoteAction({
                  invoiceId, amountFils, reason, refundToCard, locale,
                });
                if (result.ok) {
                  toast.success(t("issued", { creditNoteNo: result.creditNoteNo }), {
                    description: result.refundProblem ?? undefined,
                  });
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("issue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
