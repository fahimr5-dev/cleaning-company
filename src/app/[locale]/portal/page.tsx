import { setRequestLocale, getTranslations } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { TodoScreen } from "@/components/common/todo-screen";
import { LocaleSwitcher } from "@/components/shell/locale-switcher";
import { UserMenu } from "@/components/shell/user-menu";

/**
 * Never cache this page: what it shows depends on who is signed in. Without
 * this, Next.js can prerender the signed-out version at build time and then
 * serve everybody a redirect to the login screen.
 */
export const dynamic = "force-dynamic";


/**
 * The client's self-service portal.
 *
 * NOT BUILT YET — the working screens arrive across Phases 2 and 5. The role
 * check and the database rules behind it are live today: a client can only ever
 * reach their own bookings, invoices and photos.
 */
export default async function PortalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireRole(locale, "CLIENT");
  const t = await getTranslations("portal");
  const tApp = await getTranslations("app");

  return (
    <div className="bg-muted/30 min-h-dvh">
      <header className="bg-background sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4">
        <Sparkles className="text-primary size-5" aria-hidden />
        <span className="font-semibold">{tApp("name")}</span>
        <div className="ms-auto flex items-center gap-1">
          <LocaleSwitcher current={locale} />
          <UserMenu user={user} locale={locale} />
        </div>
      </header>

      <main className="p-4">
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          {t("greeting", { name: user.fullName.split(" ")[0] })}
        </p>

        <TodoScreen
          feature="The client portal"
          phase={2}
          willInclude={[
            "Book a clean using the same rate card as the website calculator",
            "Reschedule or cancel, within the 24-hour cutoff you configured",
            "See before and after photos of every visit",
            "View and pay invoices by card, and see the VAT breakdown",
            "Rate a clean, and see the balance left on any prepaid package",
          ]}
        />
      </main>
    </div>
  );
}
