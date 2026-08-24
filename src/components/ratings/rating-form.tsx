"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Star, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { submitRatingAction, markGoogleReviewClickedAction } from "@/app/actions/ratings";

/**
 * The star form a client fills in from their phone.
 *
 * PLAIN ENGLISH: big tap targets, one screen, no login. Five stars leads to a
 * "would you put that on Google?" prompt. A low rating says plainly that a
 * manager will be in touch — because one will: the app opens a complaint
 * ticket the moment it is submitted.
 */
function Stars({
  value, onChange, label, id,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  id: string;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div>
      <Label className="mb-2 block" id={`${id}-label`}>{label}</Label>
      <div className="flex gap-1" role="radiogroup" aria-labelledby={`${id}-label`}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={String(star)}
            data-testid={`${id}-${star}`}
            className="rounded-lg p-1.5 transition-transform hover:scale-110"
            onMouseEnter={() => setHover(star)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(star)}
          >
            <Star
              className={cn(
                "size-10",
                star <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function RatingForm({
  token, locale, googleReviewUrl, lowRatingThreshold,
}: {
  token: string;
  locale: "en" | "ar";
  googleReviewUrl: string | null;
  lowRatingThreshold: number;
}) {
  const t = useTranslations("rate");
  const [stars, setStars] = useState(0);
  const [punctuality, setPunctuality] = useState(0);
  const [quality, setQuality] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ askForGoogleReview: boolean; url: string | null; ticketOpened: boolean } | null>(null);

  if (done) {
    return (
      <Card className="mt-6">
        <CardContent className="space-y-4 p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
          <h2 className="text-xl font-semibold" data-testid="rating-thanks">{t("thanksTitle")}</h2>

          {done.ticketOpened ? (
            <p className="text-muted-foreground text-sm">{t("thanksLow")}</p>
          ) : (
            <p className="text-muted-foreground text-sm">{t("thanksHigh")}</p>
          )}

          {done.askForGoogleReview && done.url ? (
            <div className="space-y-2 pt-2">
              <p className="text-sm">{t("googlePrompt")}</p>
              <Button
                data-testid="google-review"
                render={
                  <a
                    href={done.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => { void markGoogleReviewClickedAction({ token }); }}
                  />
                }
              >
                <ExternalLink className="size-4" aria-hidden />
                {t("googleButton")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardContent className="space-y-6 p-6">
        <Stars id="overall" value={stars} onChange={(v) => { setStars(v); setError(null); }} label={t("overall")} />

        {/* Only asked once they have committed to an overall score, so the
            first screen stays a single question. */}
        {stars > 0 ? (
          <>
            <Stars id="punctuality" value={punctuality} onChange={setPunctuality} label={t("punctuality")} />
            <Stars id="quality" value={quality} onChange={setQuality} label={t("quality")} />

            <div>
              <Label htmlFor="rating-comment">
                {stars < lowRatingThreshold ? t("commentLow") : t("comment")}
              </Label>
              <Textarea
                id="rating-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={1000}
                className="mt-1.5"
                placeholder={t("commentPlaceholder")}
              />
            </div>

            {stars < lowRatingThreshold ? (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                {t("lowWarning")}
              </p>
            ) : null}
          </>
        ) : null}

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <Button
          className="w-full"
          size="lg"
          data-testid="submit-rating"
          disabled={busy || stars === 0}
          onClick={() =>
            startBusy(async () => {
              const result = await submitRatingAction({
                token, stars, locale, comment,
                punctualityStars: punctuality || null,
                qualityStars: quality || null,
              });
              if (result.ok) {
                setDone({
                  askForGoogleReview: result.askForGoogleReview,
                  url: result.googleReviewUrl ?? googleReviewUrl,
                  ticketOpened: result.ticketOpened,
                });
              } else {
                setError(result.error);
              }
            })
          }
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {stars === 0 ? t("chooseStars") : t("submit")}
        </Button>
      </CardContent>
    </Card>
  );
}
