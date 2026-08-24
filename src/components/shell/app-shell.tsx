import { getTranslations } from "next-intl/server";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { directionOf } from "@/i18n/routing";
import { SidebarNav } from "./sidebar-nav";
import { LocaleSwitcher } from "./locale-switcher";
import { UserMenu } from "./user-menu";
import type { CurrentUser } from "@/lib/auth";

/**
 * The frame every office screen sits inside: a sidebar on desktop, a slide-out
 * drawer on a phone, and a header with the language switcher and account menu.
 */
export async function AppShell({
  user,
  locale,
  children,
}: {
  user: CurrentUser;
  locale: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  // The drawer must slide in from the side the sidebar would be on: left for
  // English, right for Arabic.
  const drawerSide = directionOf(locale) === "rtl" ? "right" : "left";

  return (
    <div className="bg-background flex min-h-dvh">
      {/* Desktop sidebar. `border-e` is a logical border: it sits on the right
          in English and automatically on the left in Arabic. */}
      <aside className="bg-card hidden w-64 shrink-0 border-e lg:block">
        <div className="flex h-14 items-center gap-2 border-b px-5">
          <Sparkles className="text-primary size-5" aria-hidden />
          <span className="font-semibold">{t("app.name")}</span>
        </div>
        <SidebarNav role={user.role} locale={locale} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background/95 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 flex h-14 items-center gap-2 border-b px-4 backdrop-blur">
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" />}
            >
              <Menu className="size-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side={drawerSide} className="w-72 p-0">
              <SheetTitle className="flex h-14 items-center gap-2 border-b px-5 text-base">
                <Sparkles className="text-primary size-5" aria-hidden />
                {t("app.name")}
              </SheetTitle>
              <SidebarNav role={user.role} locale={locale} />
            </SheetContent>
          </Sheet>

          <div className="ms-auto flex items-center gap-1">
            <LocaleSwitcher current={locale} />
            <UserMenu user={user} locale={locale} />
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
