import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routing } from "@/i18n/routing";

/**
 * Where Supabase sends people back to after they click a link in an email —
 * a password reset, or an invitation to the client portal.
 *
 * It swaps the one-time code in the URL for a real signed-in session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const localeParam = searchParams.get("locale") ?? routing.defaultLocale;
  const locale = routing.locales.includes(localeParam as never)
    ? localeParam
    : routing.defaultLocale;

  // Only ever redirect inside this app: an open redirect here would let someone
  // send a CleanOS login link that lands on a lookalike site.
  const requested = searchParams.get("next") ?? "";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : `/${locale}`;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/${locale}/login?error=auth`);
}
