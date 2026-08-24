import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getCurrentUser, homePathFor } from "@/lib/auth";

/**
 * Where signing in lands you.
 *
 * Each role has a different home screen, and only the server knows which role
 * you are, so this page works it out and forwards you. The public marketing
 * site now lives at "/", which is why this is a separate address.
 */
export const dynamic = "force-dynamic";

export default async function HomeRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  redirect(`/${locale}${user ? homePathFor(user.role) : "/login"}`);
}
