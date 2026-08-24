import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Users, Wallet, Trophy, Percent } from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getLeadBoard } from "@/lib/queries/leads";
import { formatMoney } from "@/lib/money";
import { LeadBoardView } from "@/components/leads/lead-board";
import { StatCard } from "@/components/common/stat-card";

/**
 * The lead pipeline: New → Contacted → Quoted → Won → Lost.
 *
 * Enquiries from the public website land in the New column automatically.
 */
export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("leads") };
}

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(locale, ...OFFICE_ROLES);

  const board = await getLeadBoard();
  const t = await getTranslations("leads");
  const isArabic = locale === "ar";
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");

  const openLeads = board.counts.NEW + board.counts.CONTACTED + board.counts.QUOTED;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label={t("stats.open")} value={num.format(openLeads)} hint={t("stats.openHint")} />
        <StatCard
          icon={Wallet}
          label={t("stats.pipelineValue")}
          value={formatMoney(board.openValueFils, isArabic ? "ar" : "en")}
          hint={t("stats.pipelineValueHint")}
        />
        <StatCard
          icon={Trophy}
          label={t("stats.won")}
          value={formatMoney(board.wonValueFils, isArabic ? "ar" : "en")}
          hint={t("stats.wonHint", { count: num.format(board.counts.WON) })}
        />
        <StatCard
          icon={Percent}
          label={t("stats.conversion")}
          value={`${num.format(board.conversionRate)}%`}
          hint={t("stats.conversionHint")}
          tone={board.conversionRate < 30 ? "warning" : "default"}
        />
      </div>

      <p className="text-muted-foreground text-xs">{t("dragHint")}</p>

      <LeadBoardView board={board} locale={isArabic ? "ar" : "en"} />
    </div>
  );
}
