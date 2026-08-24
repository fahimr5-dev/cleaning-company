import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Sparkles, ShieldCheck, Clock, BadgeCheck, MessageCircle, Star,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getQuoteCatalog, QuoteError } from "@/lib/quote";
import { QuoteCalculator } from "@/components/public/quote-calculator";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * The public marketing page, with the instant-quote calculator on it.
 *
 * Every price and every service shown here is read from the rate card in the
 * database. Nothing is written into this file.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing" });
  return { title: t("meta.title"), description: t("meta.description") };
}

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");
  const isArabic = locale === "ar";

  // If the rate card is missing we say so plainly rather than showing a
  // calculator that would quote every job at zero.
  let catalog;
  try {
    catalog = await getQuoteCatalog();
  } catch (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20">
        <Alert variant="destructive">
          <AlertTitle>{t("calculator.unavailableTitle")}</AlertTitle>
          <AlertDescription>
            {error instanceof QuoteError ? error.message : t("calculator.unavailableBody")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const zones = await prisma.zone.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameEn: true, nameAr: true },
  });

  const services = catalog.services.map((s) => ({
    code: s.code,
    nameEn: s.nameEn,
    nameAr: s.nameAr,
    descriptionEn: s.descriptionEn,
    descriptionAr: s.descriptionAr,
    category: s.category as "CORE" | "ADDON",
    propertyTypes: [...(catalog.availability.get(s.code) ?? [])],
  }));

  const frequencies = (["ONE_OFF", "WEEKLY", "BI_WEEKLY", "MONTHLY"] as const).map((f) => ({
    value: f,
    discountBps: catalog.frequencyDiscountBps(f),
  }));

  const trust = [
    { icon: ShieldCheck, key: "insured" },
    { icon: BadgeCheck, key: "vetted" },
    { icon: Clock, key: "onTime" },
    { icon: Star, key: "rated" },
  ] as const;

  return (
    <>
      {/* ---------------- Hero ---------------- */}
      <section className="from-primary/5 border-b bg-gradient-to-b to-transparent">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:py-24 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-primary mb-3 flex items-center gap-2 text-sm font-medium">
              <Sparkles className="size-4" aria-hidden />
              {t("hero.eyebrow")}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-prose text-lg text-pretty">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#quote"
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 items-center rounded-lg px-6 text-sm font-medium"
              >
                {t("hero.cta")}
              </a>
              {catalog.org.whatsappNumber ? (
                <a
                  href={`https://wa.me/${catalog.org.whatsappNumber.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:bg-accent inline-flex h-11 items-center gap-2 rounded-lg border px-6 text-sm font-medium"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  {t("hero.whatsapp")}
                </a>
              ) : null}
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {trust.map(({ icon: Icon, key }) => (
                <div key={key}>
                  <dt className="text-primary mb-1"><Icon className="size-5" aria-hidden /></dt>
                  <dd className="text-sm font-medium">{t(`trust.${key}.title`)}</dd>
                  <dd className="text-muted-foreground text-xs">{t(`trust.${key}.body`)}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* The calculator is the hero image. It is the thing that converts. */}
          <div id="quote" className="scroll-mt-20">
            <QuoteCalculator
              locale={isArabic ? "ar" : "en"}
              services={services}
              frequencies={frequencies}
              zones={zones}
              vatRateBps={catalog.org.vatRateBps}
            />
          </div>
        </div>
      </section>

      {/* ---------------- Services ---------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-2xl font-semibold">{t("services.title")}</h2>
        <p className="text-muted-foreground mt-2">{t("services.subtitle")}</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Card key={service.code}>
              <CardContent className="p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-medium">
                    {isArabic ? service.nameAr : service.nameEn}
                  </h3>
                  {service.category === "ADDON" ? (
                    <span className="text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
                      {t("services.addOn")}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {(isArabic ? service.descriptionAr : service.descriptionEn) ?? ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
