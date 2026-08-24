"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Check, MessageCircle, Gift } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import { toast } from "sonner";

/**
 * The referral engine, from the client's side.
 *
 * PLAIN ENGLISH: every client gets a code. When somebody uses it, both of them
 * get a discount, and the revenue that referral brought in is tracked here — so
 * you can see which customers are genuinely worth more than what they spend.
 */

export type ReferralRow = {
  id: string;
  status: string;
  refereeName: string | null;
  referrerRewardFils: number;
  refereeDiscountFils: number;
  attributedRevenueFils: number;
  createdAt: string;
};

export function ReferralPanel({
  code, referrals, revenueFils, locale, shareUrl, referrerRewardFils,
}: {
  code: string;
  referrals: ReferralRow[];
  revenueFils: number;
  locale: "en" | "ar";
  shareUrl: string;
  referrerRewardFils: number;
}) {
  const t = useTranslations("clients.referral");
  const [copied, setCopied] = useState(false);

  const shareMessage =
    locale === "ar"
      ? `مرحباً! استخدم رمز الإحالة ${code} عند الحجز واحصل على خصم. ${shareUrl}`
      : `Hi! Use my referral code ${code} when you book and we both get a discount. ${shareUrl}`;

  const wa = whatsappLink("971500000000", shareMessage);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked; say so rather than looking broken.
      toast.error(t("copyFailed"));
    }
  }

  const rewarded = referrals.filter((r) => r.status === "REWARDED").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gift className="size-4" aria-hidden />
          {t("title")}
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          {t("explain", { amount: formatMoney(referrerRewardFils, locale) })}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="bg-muted rounded-md px-3 py-2 font-mono text-sm tracking-wider" dir="ltr">
            {code}
          </code>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {t("copy")}
          </Button>
          {wa ? (
            <Button
              variant="outline"
              size="sm"
              render={<a href={wa} target="_blank" rel="noopener noreferrer" />}
            >
              <MessageCircle className="size-4" aria-hidden />
              {t("share")}
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label={t("introduced")} value={String(referrals.length)} />
          <Stat label={t("rewarded")} value={String(rewarded)} />
          <Stat label={t("revenue")} value={formatMoney(revenueFils, locale)} />
        </div>

        {referrals.length > 0 ? (
          <ul className="divide-y text-sm">
            {referrals.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{r.refereeName ?? t("unknownReferee")}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {r.attributedRevenueFils > 0 ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatMoney(r.attributedRevenueFils, locale)}
                    </span>
                  ) : null}
                  <Badge variant={r.status === "REWARDED" ? "secondary" : "outline"} className="text-[10px]">
                    {t(`status.${r.status}`)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground py-2 text-center text-sm">{t("none")}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{label}</p>
    </div>
  );
}
