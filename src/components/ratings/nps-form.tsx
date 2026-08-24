"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitNpsAction } from "@/app/actions/ratings";

/**
 * Zero to ten, in one tap.
 *
 * The buttons are coloured by what the score means — red for a detractor,
 * amber for a passive, green for a promoter — but the number is always there
 * too, because colour alone is not readable for everyone.
 */
export function NpsForm({ token, locale }: { token: string; locale: "en" | "ar" }) {
  const t = useTranslations("nps");
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Card className="mt-6">
        <CardContent className="space-y-3 p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
          <h2 className="text-xl font-semibold" data-testid="nps-thanks">{t("thanksTitle")}</h2>
          <p className="text-muted-foreground text-sm">{t("thanksBody")}</p>
        </CardContent>
      </Card>
    );
  }

  const tone = (n: number) =>
    n >= 9
      ? "border-emerald-500 bg-emerald-500 text-white"
      : n >= 7
        ? "border-amber-500 bg-amber-500 text-white"
        : "border-red-500 bg-red-500 text-white";

  return (
    <Card className="mt-6">
      <CardContent className="space-y-5 p-6">
        <div>
          {/* Forced left-to-right: 0–10 is a number line, and it reads the same
              way in Arabic. */}
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-11" dir="ltr">
            {Array.from({ length: 11 }, (_, n) => (
              <button
                key={n}
                type="button"
                aria-pressed={score === n}
                data-testid={`nps-${n}`}
                onClick={() => { setScore(n); setError(null); }}
                className={cn(
                  "rounded-lg border py-3 text-sm font-medium tabular-nums transition-colors",
                  score === n ? tone(n) : "hover:bg-accent",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="text-muted-foreground mt-2 flex justify-between text-xs">
            <span>{t("scaleLow")}</span>
            <span>{t("scaleHigh")}</span>
          </div>
        </div>

        {score !== null ? (
          <div>
            <Label htmlFor="nps-comment">
              {score >= 9 ? t("commentPromoter") : score >= 7 ? t("commentPassive") : t("commentDetractor")}
            </Label>
            <Textarea
              id="nps-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              maxLength={1000}
              className="mt-1.5"
            />
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <Button
          className="w-full"
          size="lg"
          data-testid="submit-nps"
          disabled={busy || score === null}
          onClick={() =>
            startBusy(async () => {
              const result = await submitNpsAction({ token, score, comment, locale });
              if (result.ok) setDone(true);
              else setError(result.error);
            })
          }
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {t("submit")}
        </Button>
      </CardContent>
    </Card>
  );
}
