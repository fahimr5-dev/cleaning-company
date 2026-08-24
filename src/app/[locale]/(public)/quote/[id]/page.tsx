import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Download, MessageCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * A customer's own copy of their quote, reached from the email or the
 * WhatsApp message.
 *
 * HOW IT IS PROTECTED: the address contains the quote's random 128-bit id,
 * which acts as the password — the same approach as an unlisted document link.
 * It cannot be guessed, and it is only ever sent to the person it belongs to.
 * Nothing about any other customer is reachable from here.
 */
export const dynamic = "force-dynamic";

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing.calculator");
  const tq = await getTranslations("quotePage");
  const isArabic = locale === "ar";

  // A malformed id must 404, not throw a database error.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const quote = await prisma.quote.findFirst({
    where: { id, deletedAt: null },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      lead: { select: { fullName: true, phone: true, addressLine: true } },
      client: { select: { contactName: true, companyName: true, phone: true } },
    },
  });
  if (!quote) notFound();

  const org = await prisma.organization.findFirst();
  const customerName = quote.client?.companyName ?? quote.client?.contactName ?? quote.lead?.fullName ?? "";
  const expired = quote.validUntil < new Date();

  const wa = org?.whatsappNumber
    ? whatsappLink(
        org.whatsappNumber,
        isArabic
          ? `مرحباً، بخصوص عرض السعر ${quote.quoteNo}`
          : `Hi, I would like to go ahead with quote ${quote.quoteNo}`,
      )
    : null;

  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{tq("title")}</CardTitle>
            <Badge variant={expired ? "destructive" : "secondary"}>
              {expired ? tq("expired") : tq("valid", { date: dateFmt.format(quote.validUntil) })}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            {quote.quoteNo}{customerName ? ` · ${customerName}` : ""}
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="space-y-2">
            {quote.lines.map((line) => (
              <div key={line.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  {(isArabic ? line.descriptionAr : line.descriptionEn) ?? line.descriptionEn}
                  {Number(line.quantity) > 1 ? ` × ${Number(line.quantity)}` : ""}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatMoney(line.lineTotalFils, isArabic ? "ar" : "en")}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t pt-3 text-sm">
            {quote.discountFils > 0 ? (
              <div className="flex justify-between text-green-700 dark:text-green-400">
                <span>{t("referralDiscount")}</span>
                <span className="tabular-nums">-{formatMoney(quote.discountFils, isArabic ? "ar" : "en")}</span>
              </div>
            ) : null}
            <div className="text-muted-foreground flex justify-between">
              <span>{t("vat", { percent: quote.vatRateBps / 100 })}</span>
              <span className="tabular-nums">{formatMoney(quote.vatFils, isArabic ? "ar" : "en")}</span>
            </div>
            <div className="flex items-baseline justify-between border-t pt-2 font-medium">
              <span>{t("total")}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(quote.totalFils, isArabic ? "ar" : "en")}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button render={<a href={`/api/quote/${quote.id}/pdf?locale=${locale}`} />} variant="outline">
              <Download className="size-4" aria-hidden />
              {tq("download")}
            </Button>
            {wa ? (
              <Button render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>
                <MessageCircle className="size-4" aria-hidden />
                {tq("accept")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
