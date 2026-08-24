import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowLeft, Phone, Mail, MapPin, PawPrint, KeyRound, TriangleAlert, Star,
} from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getClientDetail } from "@/lib/queries/clients";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { env } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReferralPanel } from "@/components/clients/referral-panel";
import { ClientControls } from "@/components/clients/client-controls";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = await getClientDetail(id).catch(() => null);
  return { title: detail ? (detail.client.companyName ?? detail.client.contactName) : "Client" };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ...OFFICE_ROLES);

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getClientDetail(id);
  if (!detail) notFound();

  const { client, stats } = detail;
  const t = await getTranslations("clients");
  const tStatus = await getTranslations("jobStatus");
  const org = await prisma.organization.findFirst({
    select: { referrerRewardValue: true },
  });

  const isArabic = locale === "ar";
  const money = (fils: number) => formatMoney(fils, isArabic ? "ar" : "en");
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short", year: "numeric",
  });

  const displayName = client.companyName ?? client.contactName;

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" render={<Link href={`/${locale}/clients`} />} className="-ms-2 mb-2">
          <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
          {t("backToList")}
        </Button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{displayName}</h1>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span>{client.clientNo}</span>
              <Badge variant="secondary">{t(`filters.typeValues.${client.type}`)}</Badge>
              <Badge variant={client.status === "ACTIVE" ? "secondary" : "destructive"}>
                {t(`filters.statusValues.${client.status}`)}
              </Badge>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" render={<a href={`tel:${client.phone}`} />}>
              <Phone className="size-4" aria-hidden />
              {client.phone}
            </Button>
            {client.email ? (
              <Button variant="outline" size="sm" render={<a href={`mailto:${client.email}`} />}>
                <Mail className="size-4" aria-hidden />
                {t("email")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {client.isBookingPaused ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{t("controls.currentlyPaused", { reason: client.bookingPauseReason ?? "—" })}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label={t("stats.lifetime")} value={money(stats.lifetimeValueFils)} hint={t("stats.lifetimeHint", { count: num.format(stats.invoiceCount) })} />
        <SummaryTile label={t("stats.completedJobs")} value={num.format(stats.completedJobs)} />
        <SummaryTile
          label={t("stats.rating")}
          value={stats.averageRating ? stats.averageRating.toFixed(1) : "—"}
          hint={stats.ratingCount ? t("stats.ratingHint", { count: num.format(stats.ratingCount) }) : undefined}
          icon
        />
        <SummaryTile
          label={t("stats.outstanding")}
          value={money(stats.outstandingFils)}
          hint={stats.unpaidCount ? t("stats.outstandingHint", { count: num.format(stats.unpaidCount) }) : undefined}
          warn={stats.outstandingFils > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Properties, with everything the cleaner needs to get in. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("properties", { count: client.properties.length })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {client.properties.map((property) => (
                <div key={property.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{property.label}</span>
                    {property.isDefault ? <Badge variant="secondary" className="text-[10px]">{t("main")}</Badge> : null}
                  </div>

                  <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-sm">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {[property.buildingName, property.unitNumber, isArabic ? (property.zone?.nameAr ?? property.zone?.nameEn) : property.zone?.nameEn]
                      .filter(Boolean).join(" · ")}
                  </p>

                  <p className="text-muted-foreground mt-1 text-xs">
                    {[
                      property.bedrooms ? t("bedCount", { count: property.bedrooms }) : null,
                      property.bathrooms ? t("bathCount", { count: property.bathrooms }) : null,
                      property.sqm ? `${num.format(property.sqm)} m²` : null,
                    ].filter(Boolean).join(" · ")}
                  </p>

                  {property.accessNotes ? (
                    <p className="bg-muted/60 mt-2 rounded p-2 text-xs">{property.accessNotes}</p>
                  ) : null}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {property.hasPets ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <PawPrint className="size-3" aria-hidden />
                        {property.petNotes ?? t("hasPets")}
                      </Badge>
                    ) : null}
                    {property.keyHeldByCompany ? (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <KeyRound className="size-3" aria-hidden />
                        {t("keyHeld")}{property.keyTag ? ` (${property.keyTag})` : ""}
                      </Badge>
                    ) : null}
                    {property.chemicalAllergies ? (
                      <Badge variant="destructive" className="gap-1 text-[10px]">
                        <TriangleAlert className="size-3" aria-hidden />
                        {property.chemicalAllergies}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("recentJobs")}</CardTitle>
            </CardHeader>
            <CardContent>
              {client.jobs.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-sm">{t("noJobs")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {client.jobs.map((job) => (
                    <li key={job.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                      <span className="text-muted-foreground w-20 shrink-0 text-xs tabular-nums">
                        {dateFmt.format(job.scheduledStart)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {isArabic ? job.serviceType.nameAr : job.serviceType.nameEn}
                      </span>
                      <span className="tabular-nums">{money(job.totalFils)}</span>
                      <Badge variant="secondary" className="text-[10px]">{tStatus(job.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <ReferralPanel
            code={client.referralCode}
            locale={isArabic ? "ar" : "en"}
            shareUrl={`${env.appUrl}/${locale}`}
            referrerRewardFils={org?.referrerRewardValue ?? 0}
            revenueFils={stats.referralRevenueFils}
            referrals={client.referralsMade.map((r) => ({
              id: r.id,
              status: r.status,
              refereeName:
                r.refereeClient?.companyName ?? r.refereeClient?.contactName ?? r.refereeLead?.fullName ?? null,
              referrerRewardFils: r.referrerRewardFils,
              refereeDiscountFils: r.refereeDiscountFils,
              attributedRevenueFils: r.attributedRevenueFils,
              createdAt: r.createdAt.toISOString(),
            }))}
          />

          {client.referredBy ? (
            <Card>
              <CardContent className="pt-6 text-sm">
                <p className="text-muted-foreground text-xs">{t("referral.referredBy")}</p>
                <Link
                  href={`/${locale}/clients/${client.referredBy.id}`}
                  className="font-medium hover:underline"
                >
                  {client.referredBy.companyName ?? client.referredBy.contactName}
                </Link>
              </CardContent>
            </Card>
          ) : null}

          <ClientControls
            clientId={client.id}
            locale={isArabic ? "ar" : "en"}
            isOwner={user.role === "OWNER"}
            billingMode={client.billingMode}
            paymentTermsDays={client.paymentTermsDays}
            trn={client.trn}
            isBookingPaused={client.isBookingPaused}
            pauseReason={client.bookingPauseReason}
            vipNotes={client.vipNotes}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label, value, hint, warn, icon,
}: { label: string; value: string; hint?: string; warn?: boolean; icon?: boolean }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className={`mt-0.5 flex items-center gap-1 text-2xl font-semibold tabular-nums ${warn ? "text-amber-700 dark:text-amber-400" : ""}`}>
          {icon && value !== "—" ? <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden /> : null}
          {value}
        </p>
        {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
