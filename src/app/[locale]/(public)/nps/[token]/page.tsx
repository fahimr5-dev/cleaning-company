import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { NpsForm } from "@/components/ratings/nps-form";
import { Card, CardContent } from "@/components/ui/card";

/**
 * The one-question quarterly survey.
 *
 * Same rule as the rating page: no login, the random code in the address is
 * the password, and it answers once.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nps" });
  return { title: t("title"), robots: { index: false, follow: false } };
}

export default async function NpsPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const response = await prisma.npsResponse.findUnique({
    where: { token },
    select: {
      score: true, respondedAt: true,
      client: { select: { contactName: true, companyName: true } },
    },
  });
  if (!response) notFound();

  const t = await getTranslations("nps");
  const firstName = (response.client.companyName ?? response.client.contactName).split(" ")[0];

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      {response.respondedAt ? (
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" aria-hidden />
            <h1 className="text-xl font-semibold">{t("alreadyTitle")}</h1>
            <p className="text-muted-foreground text-sm">
              {t("alreadyBody", { score: response.score ?? 0 })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <h1 className="text-2xl font-semibold">{t("greeting", { name: firstName })}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("question")}</p>
          <NpsForm token={token} locale={locale === "ar" ? "ar" : "en"} />
        </>
      )}
    </div>
  );
}
