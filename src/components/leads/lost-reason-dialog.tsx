"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const LOST_REASONS = [
  "PRICE_TOO_HIGH", "WENT_WITH_COMPETITOR", "NO_RESPONSE",
  "NO_AVAILABILITY", "OUT_OF_SERVICE_AREA", "NOT_SERIOUS", "OTHER",
] as const;

/**
 * Asks WHY a deal was lost before letting it move to the Lost column.
 *
 * PLAIN ENGLISH: "we lost 40 deals last month" tells you nothing. "we lost 28
 * of them on price" tells you to change your rate card. That is why this cannot
 * be skipped.
 */
export function LostReasonDialog({
  open, onCancel, onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, note: string | null) => void;
}) {
  const t = useTranslations("leads");
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
          setReason("");
          setNote("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("lostDialog.title")}</DialogTitle>
          <DialogDescription>{t("lostDialog.body")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t("lostDialog.reason")}</Label>
            <div className="flex flex-wrap gap-2">
              {LOST_REASONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={reason === value}
                  onClick={() => setReason(value)}
                  className={
                    reason === value
                      ? "border-primary bg-primary text-primary-foreground rounded-lg border px-3 py-1.5 text-sm"
                      : "hover:bg-accent rounded-lg border px-3 py-1.5 text-sm"
                  }
                >
                  {t(`lostReason.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="lost-note">{t("lostDialog.note")}</Label>
            <Textarea
              id="lost-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t("lostDialog.cancel")}</Button>
          <Button
            disabled={!reason}
            onClick={() => {
              onConfirm(reason, note.trim() || null);
              setReason("");
              setNote("");
            }}
          >
            {t("lostDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
