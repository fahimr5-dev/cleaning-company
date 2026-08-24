"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, RefreshCw, Send, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import {
  rebuildRiskAction, resolveRiskFlagAction, previewWinbackAction,
  createCampaignAction, approveAndSendCampaignAction, cancelCampaignAction,
  runRetentionNowAction,
} from "@/app/actions/retention";

/** Rebuilds the at-risk list from what the data says today. */
export function RebuildRiskButton({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("retention");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={busy}
      data-testid="rebuild-risk"
      onClick={() =>
        startBusy(async () => {
          const result = await rebuildRiskAction({ locale });
          if (!result.ok) { toast.error(result.error); return; }
          toast.success(t("risk.rebuilt", {
            checked: result.clientsChecked,
            opened: result.flagsOpened,
            closed: result.flagsClosed,
          }));
          router.refresh();
        })
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
      {t("risk.rebuild")}
    </Button>
  );
}

/** Sends whatever rating requests, surveys and referral payouts are due now. */
export function RunRetentionButton({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("retention");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  return (
    <Button
      variant="outline"
      disabled={busy}
      data-testid="run-retention"
      onClick={() =>
        startBusy(async () => {
          const result = await runRetentionNowAction({ locale });
          if (!result.ok) { toast.error(result.error); return; }
          const nothing = result.ratingsSent === 0 && result.surveysSent === 0 && result.referralsRewarded === 0;
          if (nothing) {
            toast.info(t("run.nothing"));
          } else {
            toast.success(t("run.done", {
              ratings: result.ratingsSent,
              surveys: result.surveysSent,
              referrals: result.referralsRewarded,
            }), { description: result.problems[0] });
          }
          router.refresh();
        })
      }
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
      {t("run.button")}
    </Button>
  );
}

/** Closes one warning with a note about what was done. */
export function ResolveFlagButton({
  flagId, locale,
}: {
  flagId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("retention");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, startBusy] = useTransition();

  function resolve(outcome: "ACTIONED" | "DISMISSED") {
    startBusy(async () => {
      const result = await resolveRiskFlagAction({ flagId, outcome, note, locale });
      if (result.ok) {
        toast.success(outcome === "ACTIONED" ? t("risk.marked") : t("risk.dismissed"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} data-testid="resolve-flag">
        {t("risk.resolve")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("risk.resolveTitle")}</DialogTitle>
            <DialogDescription>{t("risk.resolveBody")}</DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="flag-note">{t("risk.note")}</Label>
            <Textarea
              id="flag-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1.5"
              placeholder={t("risk.notePlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => resolve("DISMISSED")}>
              <X className="size-4" aria-hidden />
              {t("risk.dismiss")}
            </Button>
            <Button disabled={busy} onClick={() => resolve("ACTIONED")} data-testid="confirm-actioned">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {t("risk.actioned")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Audience = { clientId: string; name: string; daysSinceLastJob: number | null; lifetimeValueFils: number };

/**
 * Building a win-back campaign.
 *
 * PLAIN ENGLISH: this shows you exactly who you are about to message, and how
 * long each of them has been quiet, BEFORE anything is created. Nothing is sent
 * until you press approve on the draft afterwards.
 */
export function WinbackBuilder({ locale, isOwner }: { locale: "en" | "ar"; isOwner: boolean }) {
  const t = useTranslations("retention");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<Audience[] | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, startLoading] = useTransition();
  const [creating, startCreating] = useTransition();

  function openBuilder() {
    setOpen(true);
    setAudience(null);
    setExcluded(new Set());
    startLoading(async () => {
      const result = await previewWinbackAction({ locale });
      if (result.ok) setAudience(result.audience);
      else toast.error(result.error);
    });
  }

  const chosen = (audience ?? []).filter((a) => !excluded.has(a.clientId));

  return (
    <>
      <Button variant="outline" onClick={openBuilder} data-testid="build-winback">
        <Send className="size-4" aria-hidden />
        {t("campaigns.build")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("campaigns.buildTitle")}</DialogTitle>
            <DialogDescription>{t("campaigns.buildBody")}</DialogDescription>
          </DialogHeader>

          {loading || audience === null ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Loader2 className="mx-auto mb-2 size-5 animate-spin" aria-hidden />
              {t("campaigns.working")}
            </p>
          ) : audience.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm" data-testid="winback-empty">
              {t("campaigns.nobody")}
            </p>
          ) : (
            <>
              <p className="text-sm" data-testid="winback-count">
                {t("campaigns.chosen", { count: chosen.length, total: audience.length })}
              </p>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {audience.map((person) => (
                  <li key={person.clientId}>
                    <label className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-lg p-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={!excluded.has(person.clientId)}
                        onChange={(e) => {
                          const next = new Set(excluded);
                          if (e.target.checked) next.delete(person.clientId);
                          else next.add(person.clientId);
                          setExcluded(next);
                        }}
                      />
                      <span className="min-w-0 flex-1 truncate">{person.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {person.daysSinceLastJob !== null
                          ? t("campaigns.quietFor", { days: person.daysSinceLastJob })
                          : "—"}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums">
                        {formatMoney(person.lifetimeValueFils, locale)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("campaigns.cancel")}</Button>
            <Button
              disabled={creating || chosen.length === 0 || !isOwner}
              title={isOwner ? undefined : t("campaigns.ownerOnly")}
              data-testid="create-campaign"
              onClick={() =>
                startCreating(async () => {
                  const result = await createCampaignAction({
                    name: t("campaigns.defaultName", { count: chosen.length }),
                    type: "WINBACK",
                    channel: "BOTH",
                    templateCode: "WINBACK",
                    clientIds: chosen.map((c) => c.clientId),
                    locale,
                  });
                  if (result.ok) {
                    toast.success(t("campaigns.drafted", { count: result.recipients }));
                    setOpen(false);
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("campaigns.createDraft")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Approving a draft campaign, which is the moment messages actually go out.
 * Deliberately a second, separate click from building the list.
 */
export function CampaignApproval({
  campaignId, recipients, locale,
}: {
  campaignId: string;
  recipients: number;
  locale: "en" | "ar";
}) {
  const t = useTranslations("retention");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, startBusy] = useTransition();
  const [cancelling, startCancelling] = useTransition();

  return (
    <>
      <div className="flex gap-1">
        <Button size="sm" onClick={() => setOpen(true)} data-testid="approve-campaign">
          {t("campaigns.approve")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={cancelling}
          onClick={() =>
            startCancelling(async () => {
              const result = await cancelCampaignAction({ campaignId, locale });
              if (result.ok) { toast.success(t("campaigns.cancelled")); router.refresh(); }
              else toast.error(result.error);
            })
          }
        >
          {t("campaigns.cancel")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("campaigns.approveTitle")}</DialogTitle>
            <DialogDescription>
              {t("campaigns.approveBody", { count: recipients })}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("campaigns.cancel")}</Button>
            <Button
              disabled={busy}
              data-testid="confirm-send"
              onClick={() =>
                startBusy(async () => {
                  const result = await approveAndSendCampaignAction({ campaignId, locale });
                  if (!result.ok) { toast.error(result.error); return; }
                  if (result.failed > 0) {
                    toast.warning(
                      t("campaigns.partlySent", { sent: result.sent, failed: result.failed }),
                      { description: result.problems[0] },
                    );
                  } else {
                    toast.success(t("campaigns.sent", { sent: result.sent }));
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {t("campaigns.sendNow")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
