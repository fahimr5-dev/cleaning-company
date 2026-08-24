"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, PauseCircle, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  setClientBookingPauseAction, updateClientBillingAction, updateClientNotesAction,
} from "@/app/actions/clients";

/**
 * The editable parts of a client record.
 *
 * Billing terms are money settings, so only an Owner sees those controls — an
 * Operations Manager sees the values but no Save button, matching the rule the
 * database enforces separately.
 */
export function ClientControls({
  clientId, locale, isOwner, billingMode, paymentTermsDays, trn, isBookingPaused, pauseReason, vipNotes,
}: {
  clientId: string;
  locale: "en" | "ar";
  isOwner: boolean;
  billingMode: string;
  paymentTermsDays: number;
  trn: string | null;
  isBookingPaused: boolean;
  pauseReason: string | null;
  vipNotes: string | null;
}) {
  const t = useTranslations("clients.controls");
  const router = useRouter();

  const [mode, setMode] = useState(billingMode);
  const [terms, setTerms] = useState(String(paymentTermsDays));
  const [trnValue, setTrnValue] = useState(trn ?? "");
  const [notes, setNotes] = useState(vipNotes ?? "");
  const [reason, setReason] = useState("");
  const [saving, startSaving] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    startSaving(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("billing")}</CardTitle>
          {!isOwner ? <p className="text-muted-foreground text-xs">{t("ownerOnly")}</p> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="mb-2 block">{t("billingMode")}</Label>
            <div className="flex flex-wrap gap-2">
              {(["PER_JOB", "MONTHLY_CONSOLIDATED"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!isOwner}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={
                    mode === value
                      ? "border-primary bg-primary text-primary-foreground rounded-lg border px-3 py-1.5 text-sm"
                      : "hover:bg-accent rounded-lg border px-3 py-1.5 text-sm disabled:opacity-60"
                  }
                >
                  {t(`billingModes.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="terms">{t("paymentTerms")}</Label>
              <Input
                id="terms" type="number" min={0} max={180} value={terms}
                disabled={!isOwner} onChange={(e) => setTerms(e.target.value)} className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="trn">{t("trn")}</Label>
              <Input
                id="trn" value={trnValue} disabled={!isOwner} dir="ltr" maxLength={20}
                onChange={(e) => setTrnValue(e.target.value)} className="mt-1.5"
                placeholder={t("trnPlaceholder")}
              />
            </div>
          </div>

          {isOwner ? (
            <Button
              disabled={saving}
              onClick={() =>
                run(
                  () => updateClientBillingAction({
                    clientId, billingMode: mode, paymentTermsDays: Number(terms), trn: trnValue, locale,
                  }),
                  t("billingSaved"),
                )
              }
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("save")}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("booking")}</CardTitle>
          <p className="text-muted-foreground text-xs">{t("bookingHint")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {isBookingPaused ? (
            <>
              <p className="rounded-md bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                {t("currentlyPaused", { reason: pauseReason ?? "—" })}
              </p>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() =>
                  run(() => setClientBookingPauseAction({ clientId, paused: false, locale }), t("resumed"))
                }
              >
                <PlayCircle className="size-4" aria-hidden />
                {t("resume")}
              </Button>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="pause-reason">{t("pauseReason")}</Label>
                <Input
                  id="pause-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                  className="mt-1.5" maxLength={300} placeholder={t("pauseReasonPlaceholder")}
                />
              </div>
              <Button
                variant="outline"
                disabled={saving || !reason.trim()}
                onClick={() =>
                  run(
                    () => setClientBookingPauseAction({ clientId, paused: true, reason, locale }),
                    t("paused"),
                  )
                }
              >
                <PauseCircle className="size-4" aria-hidden />
                {t("pause")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("notes")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder={t("notesPlaceholder")}
          />
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => run(() => updateClientNotesAction({ clientId, vipNotes: notes, locale }), t("notesSaved"))}
          >
            {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
