import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/components/shell/app-shell";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";

/**
 * Never cache this page: what it shows depends on who is signed in. Without
 * this, Next.js can prerender the signed-out version at build time and then
 * serve everybody a redirect to the login screen.
 */
export const dynamic = "force-dynamic";


/**
 * Every office screen goes through here, so the role check happens once and
 * cannot be forgotten on an individual page. A cleaner or client who reaches
 * one of these URLs is quietly sent back to their own home screen.
 */
export default async function OfficeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireRole(locale, ...OFFICE_ROLES);

  return (
    <AppShell user={user} locale={locale}>
      {children}
    </AppShell>
  );
}
