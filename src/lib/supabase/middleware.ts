import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Keeps the sign-in session alive.
 *
 * PLAIN ENGLISH: Supabase logins expire after an hour. This runs on every
 * request, quietly renews the session and writes the refreshed cookie back, so
 * nobody gets thrown out mid-job.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse> {
  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Must be getUser(), not getSession(): getUser() re-checks the token with
  // Supabase's servers, so a revoked login is actually rejected.
  await supabase.auth.getUser();

  return response;
}
