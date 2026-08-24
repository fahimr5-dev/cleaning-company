import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import { routing, directionOf } from "@/i18n/routing";
import { Toaster } from "@/components/ui/sonner";
import "../globals.css";

// One font for Latin script, one designed for Arabic. Both are loaded as CSS
// variables so a single `font-sans` class picks the right one per language.
const inter = Inter({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: { default: t("name"), template: `%s · ${t("name")}` }, description: t("tagline") };
}

// Builds both /en and /ar ahead of time.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const dir = directionOf(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={`${inter.variable} ${arabic.variable} antialiased`}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} />
      </body>
    </html>
  );
}
