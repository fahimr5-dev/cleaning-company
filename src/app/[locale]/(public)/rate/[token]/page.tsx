import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { RatingForm } from "@/components/ratings/rating-form";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The page a client lands on from "how did we do?".
 *
 * PLAIN ENGLISH: no login. The long random code in the address IS the password
 * — it cannot be guessed, and it only ever reaches the person whose clean it
 * was. It works once: after they rate, the page shows their answer back to them
 * rather than letting anyone change it.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rate" });
  // Deliberately not indexed: a rating link is private to one customer.
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function RatePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const rating = await prisma.rating.findUnique({
    where: { token },
    select: {
      id: true, stars: true, comment: true, submittedAt: true,
      job: {
        select: {
          jobNo: true, scheduledStart: true,
          serviceType: { select: { nameEn: true, nameAr: true } },
        },
      },
      client: { select: { contactName: true, companyName: true } },
    },
  });

  // An unknown token is a 404, not an error page — it should look exactly like
  // a link that never existed.
  if (!rating) notFound();

  const t = await getTranslations("rate");
  const isArabic = locale === "ar";
  const org = await prisma.organization.findFirst({
    select: { googleReviewUrl: true, reCleanRatingThreshold: true },
  });

  const serviceName = isArabic ? rating.job.serviceType.nameAr : rating.job.serviceType.nameEn;
  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "long", year: "numeric",
  });
  const firstName = (rating.client.companyName ?? rating.client.contactName).split(" ")[0];

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      {rating.submittedAt ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
            <h1 className="text-xl font-semibold">{t("alreadyTitle")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("alreadyBody", { stars: rating.stars, jobNo: rating.job.jobNo })}
            </p>
            {rating.comment ? (
              <p className="bg-muted rounded-lg p-3 text-start text-sm">“{rating.comment}”</p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{t("greeting", { name: firstName })}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("about", {
              service: serviceName,
              date: dateFmt.format(rating.job.scheduledStart),
            })}
          </p>

          <RatingForm
            token={token}
            locale={isArabic ? "ar" : "en"}
            googleReviewUrl={org?.googleReviewUrl ?? null}
            lowRatingThreshold={org?.reCleanRatingThreshold ?? 4}
          />
        </>
      )}
    </div>
  );
}
