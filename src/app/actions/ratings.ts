"use server";

import { z } from "zod";
import { submitRating, markGoogleReviewClicked } from "@/lib/ratings";
import { submitNpsResponse } from "@/lib/nps";

/**
 * What a client sends back from a rating or survey link.
 *
 * These are the only actions in CleanOS that run without anybody being signed
 * in. What makes that safe is the 128-bit token in the link: it identifies one
 * specific job, it works once, and it reveals nothing about any other customer.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const submitSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/, "That rating link is not valid."),
  stars: z.coerce.number().int().min(1).max(5),
  punctualityStars: z.coerce.number().int().min(1).max(5).nullish(),
  qualityStars: z.coerce.number().int().min(1).max(5).nullish(),
  comment: z.string().trim().max(1000).optional(),
  locale: z.string().max(5).default("en"),
});

export async function submitRatingAction(
  raw: unknown,
): Promise<Result<{ askForGoogleReview: boolean; googleReviewUrl: string | null; ticketOpened: boolean }>> {
  const parsed = submitSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please choose a star rating." };
  }
  const { token, stars, punctualityStars, qualityStars, comment } = parsed.data;

  const result = await submitRating({
    token, stars,
    punctualityStars: punctualityStars ?? null,
    qualityStars: qualityStars ?? null,
    comment: comment ?? null,
  });

  if (!result.ok) {
    const messages = {
      NOT_FOUND: "That rating link is no longer valid.",
      ALREADY_RATED: "Thank you — this clean has already been rated.",
      BAD_STARS: "Please choose between one and five stars.",
    } as const;
    return { ok: false, error: messages[result.error] };
  }

  // Deliberately NOT revalidated. Refreshing this page from the server would
  // replace the thank-you screen with "already rated" — and take the Google
  // review prompt with it, which is the one moment a happy client will act on.
  return {
    ok: true,
    askForGoogleReview: result.askForGoogleReview,
    googleReviewUrl: result.googleReviewUrl,
    ticketOpened: Boolean(result.ticketNo),
  };
}

const clickSchema = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/) });

/** Records that the client actually went on to Google, for the quality report. */
export async function markGoogleReviewClickedAction(raw: unknown): Promise<Result> {
  const parsed = clickSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That link is not valid." };
  await markGoogleReviewClicked(parsed.data.token);
  return { ok: true };
}

const npsSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/, "That survey link is not valid."),
  score: z.coerce.number().int().min(0).max(10),
  comment: z.string().trim().max(1000).optional(),
  locale: z.string().max(5).default("en"),
});

export async function submitNpsAction(raw: unknown): Promise<Result> {
  const parsed = npsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please choose a score from 0 to 10." };
  }
  const { token, score, comment } = parsed.data;

  const result = await submitNpsResponse({ token, score, comment: comment ?? null });
  if (!result.ok) {
    const messages = {
      NOT_FOUND: "That survey link is no longer valid.",
      ALREADY_ANSWERED: "Thank you — you have already answered this survey.",
    } as const;
    return { ok: false, error: messages[result.error] };
  }

  // Not revalidated, for the same reason as the rating page above.
  return { ok: true };
}
