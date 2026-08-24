import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser, homePathFor } from "@/lib/auth";

/**
 * Never cache this page: what it shows depends on who is signed in. Without
 * this, Next.js can prerender the signed-out version at build time and then
 * serve everybody a redirect to the login screen.
 */
export const dynamic = "force-dynamic";


/**
 * The front door. Sends each person to their own home screen, and anyone not
 * signed in to the login page.
 *
 * TODO (Phase 2): this is where the PUBLIC MARKETING SITE and the instant-quote
 * calculator will live. Today it only redirects.
 */
export default async function LocaleHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  redirect(`/${locale}${user ? homePathFor(user.role) : "/login"}`);
}
