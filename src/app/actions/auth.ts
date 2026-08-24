"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * Signs the current person out and returns them to the login screen.
 *
 * PLAIN ENGLISH: this runs on the server, so the session cookie is properly
 * destroyed rather than just hidden in the browser.
 */
export async function signOutAction(localeInput: string) {
  const locale = routing.locales.includes(localeInput as never)
    ? localeInput
    : routing.defaultLocale;

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect(`/${locale}/login`);
}
