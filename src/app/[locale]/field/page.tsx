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
 * The cleaner's phone view.
 *
 * NOT BUILT YET — the working screens arrive in Phase 4. What IS live today is
 * the security around it: only someone with the CLEANER role can open this URL,
 * and the database will only ever hand them their own team's jobs.
 */
export default async function FieldPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireRole(locale, "CLEANER");
  const t = await getTranslations("field");
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
          feature="The cleaner mobile view"
          phase={4}
          willInclude={[
            "Today's jobs with the address as a Google Maps link",
            "Gate codes, pets, chemical allergies and key-holding status",
            "Clock in and out with a GPS check within 200m of the property",
            "The digital checklist, which must be completed before a job can be closed",
            "Before and after photos, compressed on the phone before upload",
            "Report damage, no access or an on-site complaint straight to the office",
          ]}
        />
      </main>
    </div>
  );
}
