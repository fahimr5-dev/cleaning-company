import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { prisma } from "@/lib/prisma";

/**
 * The frame around the public website — the pages anyone can see without
 * logging in. Deliberately separate from the office shell so a visitor never
 * loads a single line of the admin interface.
 */
export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("marketing");

  const org = await prisma.organization.findFirst({
    select: { name: true, nameAr: true, phone: true, email: true, whatsappNumber: true, trn: true },
  });
  const companyName = (locale === "ar" ? org?.nameAr : org?.name) ?? org?.name ?? "CleanOS";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/90 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href={`/${locale}`} className="flex items-center gap-2 font-semibold">
            <Sparkles className="text-primary size-5" aria-hidden />
            <span className="truncate">{companyName}</span>
          </Link>

          <nav className="ms-auto flex items-center gap-1">
            <Button
              render={<a href="#quote" />}
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              {t("nav.getQuote")}
            </Button>
            <LocaleSwitcher current={locale} />
            <Button render={<Link href={`/${locale}/login`} />} variant="outline" size="sm">
              {t("nav.signIn")}
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-muted/40 border-t">
        <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} {companyName}</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {org?.phone ? <span dir="ltr">{org.phone}</span> : null}
            {org?.email ? <span dir="ltr">{org.email}</span> : null}
            {org?.trn ? <span>{t("footer.trn")}: <span dir="ltr">{org.trn}</span></span> : null}
          </p>
        </div>
      </footer>
    </div>
  );
}
