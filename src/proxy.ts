import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Runs before every page.
 *
 * PLAIN ENGLISH: two jobs, in this order.
 *   1. Work out the language (/en or /ar) and redirect if it is missing.
 *   2. Renew the sign-in session so nobody is logged out mid-shift.
 *
 * In Next.js 16 this file is called `proxy.ts`; older guides call the same
 * thing `middleware.ts`.
 */

const handleI18n = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = handleI18n(request);

  // If next-intl is redirecting to add a language prefix, let that happen first;
  // the session is refreshed on the request that follows.
  if (response.headers.get("location")) return response;

  if (!isSupabaseConfigured()) return response;

  return updateSession(request, response as NextResponse);
}

export const config = {
  // Skip Next's internals, API routes, the auth callback, and anything that
  // looks like a file (favicon.ico, logo.png).
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
