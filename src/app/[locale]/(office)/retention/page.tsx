import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  HeartHandshake, Star, Gauge, Gift, AlertTriangle, MessageSquareQuote,
} from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import {
  getClientsAtRisk, getRatingFeed, getNpsBoard, getReferralBoard, getCampaigns,
} from "@/lib/queries/retention";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/common/stat-card";
import {
  RebuildRiskButton, RunRetentionButton, ResolveFlagButton,
  WinbackBuilder, CampaignApproval,
} from "@/components/retention/retention-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** Auth-dependent, so it must be rendered per request and never prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("retention") };
}

export default async function RetentionPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ...OFFICE_ROLES);
  const isOwner = user.role === "OWNER";

  const t = await getTranslations("retention");
  const isArabic = locale === "ar";
  const lang: "en" | "ar" = isArabic ? "ar" : "en";
  const money = (fils: number) => formatMoney(fils, lang);
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short",
  });

  // Read one after another rather than all at once: each is a separate query
  // and the page is not slow enough for the parallelism to be worth it.
  const risk = await getClientsAtRisk();
  const ratings = await getRatingFeed({ limit: 12 });
  const nps = await getNpsBoard();
  const referrals = await getReferralBoard();
  const campaigns = await getCampaigns();

  const npsDelta =
    nps.current.score !== null && nps.previous.score !== null
      ? nps.current.score - nps.previous.score
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RebuildRiskButton locale={lang} />
          {isOwner ? <RunRetentionButton locale={lang} /> : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Star}
          label={t("stats.averageStars")}
          value={ratings.averageStars === null ? "—" : num.format(ratings.averageStars)}
          hint={t("stats.averageStarsHint", { count: num.format(ratings.ratedLast90) })}
          tone={ratings.averageStars !== null && ratings.averageStars < 4 ? "warning" : "default"}
        />
        <StatCard
          icon={Gauge}
          label={t("stats.nps", { quarter: nps.quarter })}
          value={nps.current.score === null ? "—" : num.format(nps.current.score)}
          hint={
            npsDelta === null
              ? t("stats.npsNoCompare", { count: num.format(nps.current.responses) })
              : t("stats.npsDelta", {
                  delta: `${npsDelta >= 0 ? "+" : "−"}${num.format(Math.abs(npsDelta))}`,
                  quarter: nps.lastQuarter,
                })
          }
          tone={nps.current.score !== null && nps.current.score < 0 ? "danger" : "default"}
        />
        <StatCard
          icon={AlertTriangle}
          label={t("stats.atRisk")}
          value={num.format(risk.length)}
          hint={t("stats.atRiskHint")}
          tone={risk.length > 0 ? "warning" : "default"}
        />
        <StatCard
          icon={Gift}
          label={t("stats.referralRevenue")}
          value={money(referrals.attributedRevenueFils)}
          hint={t("stats.referralRevenueHint", { count: num.format(referrals.total) })}
        />
      </div>

      {/* Who is drifting away, worst first. */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <HeartHandshake className="size-4" aria-hidden />
              {t("risk.title")}
            </h2>
            <span className="text-muted-foreground text-xs">{t("risk.hint")}</span>
          </div>

          {risk.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm" data-testid="risk-empty">
              {t("risk.empty")}
            </p>
          ) : (
            <ul className="divide-y">
              {risk.map((row) => (
                <li key={row.clientId} className="py-3" data-testid="risk-row">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/${locale}/clients/${row.clientId}`}
                        className="font-medium hover:underline"
                      >
                        {row.clientName}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {row.clientNo} · {t("risk.lifetime", { amount: money(row.lifetimeValueFils) })}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      data-testid="risk-score"
                      className={
                        row.worstScore >= 75
                          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }
                    >
                      {t("risk.score", { score: num.format(row.worstScore) })}
                    </Badge>
                  </div>

                  <ul className="mt-2 space-y-2">
                    {row.flags.map((flag) => (
                      <li key={flag.id} className="bg-muted/40 rounded-lg p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{t(`risk.reasons.${flag.reason}`)}</p>
                            <p className="text-muted-foreground text-xs">{flag.detail}</p>
                            <p className="mt-1 text-xs">{flag.suggestedAction}</p>
                          </div>
                          <ResolveFlagButton flagId={flag.id} locale={lang} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent ratings. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Star className="size-4" aria-hidden />
              {t("ratings.title")}
            </h2>
            <p className="text-muted-foreground mb-3 text-xs">
              {t("ratings.hint", {
                low: num.format(ratings.lowCount),
                awaiting: num.format(ratings.awaitingReply),
                threshold: num.format(ratings.threshold),
              })}
            </p>

            {ratings.rows.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">{t("ratings.empty")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {ratings.rows.map((rating) => (
                  <li key={rating.id} className="py-2.5" data-testid="rating-row" data-stars={rating.stars}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span aria-label={t("ratings.stars", { stars: rating.stars })}>
                          {"★".repeat(rating.stars)}
                          <span className="text-muted-foreground/40">{"★".repeat(5 - rating.stars)}</span>
                        </span>
                        <Link
                          href={`/${locale}/clients/${rating.clientId}`}
                          className="ms-2 hover:underline"
                        >
                          {rating.clientName}
                        </Link>
                        {rating.comment ? (
                          <p className="text-muted-foreground mt-0.5 text-xs">“{rating.comment}”</p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-end">
                        <span className="text-muted-foreground text-xs">
                          {dateFmt.format(new Date(rating.submittedAt))}
                        </span>
                        {rating.ticketNo ? (
                          <Badge variant="destructive" className="mt-1 block text-[10px]">
                            {rating.ticketNo}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
              {t("ratings.google", {
                shown: num.format(ratings.googleShown),
                clicked: num.format(ratings.googleClicked),
              })}
            </p>
          </CardContent>
        </Card>

        {/* NPS. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Gauge className="size-4" aria-hidden />
              {t("nps.title", { quarter: nps.quarter })}
            </h2>

            {nps.current.responses === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm" data-testid="nps-empty">
                {t("nps.empty", { outstanding: num.format(nps.outstanding) })}
              </p>
            ) : (
              <>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
                  {([
                    ["promoters", nps.current.promoters, "text-emerald-700 dark:text-emerald-400"],
                    ["passives", nps.current.passives, "text-amber-700 dark:text-amber-400"],
                    ["detractors", nps.current.detractors, "text-red-700 dark:text-red-400"],
                  ] as const).map(([key, value, tone]) => (
                    <div key={key} className="bg-muted/40 rounded-lg p-3">
                      <dt className="text-muted-foreground text-xs">{t(`nps.${key}`)}</dt>
                      <dd className={`text-xl font-semibold tabular-nums ${tone}`}>{num.format(value)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-muted-foreground mt-3 text-xs">
                  {t("nps.outstanding", { count: num.format(nps.outstanding) })}
                </p>

                {nps.comments.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t pt-3 text-sm">
                    {nps.comments.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <MessageSquareQuote className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          <span className="font-medium tabular-nums">{num.format(c.score)}/10</span>
                          {" — "}
                          <Link href={`/${locale}/clients/${c.clientId}`} className="hover:underline">
                            {c.clientName}
                          </Link>
                          <span className="text-muted-foreground block text-xs">“{c.comment}”</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Campaigns. */}
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">{t("campaigns.title")}</h2>
              <WinbackBuilder locale={lang} isOwner={isOwner} />
            </div>

            {campaigns.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm" data-testid="campaigns-empty">
                {t("campaigns.empty")}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {campaigns.map((campaign) => (
                  <li key={campaign.id} className="py-2.5" data-testid="campaign-row" data-status={campaign.status}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-muted-foreground text-xs">
                          {t(`campaigns.types.${campaign.type}`)}
                          {" · "}
                          {t("campaigns.recipients", { count: num.format(campaign.recipients) })}
                          {campaign.status === "SENT"
                            ? ` · ${t("campaigns.converted", { count: num.format(campaign.converted) })}`
                            : ""}
                        </p>
                      </div>
                      {campaign.status === "DRAFT" && isOwner ? (
                        <CampaignApproval
                          campaignId={campaign.id}
                          recipients={campaign.recipients}
                          locale={lang}
                        />
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          {t(`campaigns.status.${campaign.status}`)}
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Referrals. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-medium">
              <Gift className="size-4" aria-hidden />
              {t("referrals.title")}
            </h2>
            <p className="text-muted-foreground mb-3 text-xs">
              {t("referrals.hint", {
                rewarded: num.format(referrals.counts.REWARDED ?? 0),
                pending: num.format(referrals.counts.PENDING ?? 0),
                paid: money(referrals.rewardedFils),
              })}
            </p>

            {referrals.rows.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">{t("referrals.empty")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {referrals.rows.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 py-2.5" data-testid="referral-row">
                    <div className="min-w-0">
                      <Link href={`/${locale}/clients/${row.referrerId}`} className="font-medium hover:underline">
                        {row.referrerName}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {row.refereeName
                          ? t("referrals.brought", { name: row.refereeName })
                          : t("referrals.codeOnly", { code: row.code })}
                      </p>
                    </div>
                    <div className="shrink-0 text-end">
                      <p className="tabular-nums">{money(row.attributedRevenueFils)}</p>
                      <Badge variant="secondary" className="mt-0.5 text-[10px]" data-status={row.status}>
                        {t(`referrals.status.${row.status}`)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
