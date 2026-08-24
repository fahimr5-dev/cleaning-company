/**
 * Environment variables, checked in one place.
 *
 * PLAIN ENGLISH: rather than crashing with a confusing error deep inside the
 * app when a key is missing, we check here and show you a setup screen that
 * names the exact variable and where to get it.
 */

export const env = {
  supabaseUrl:
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

/** True once Supabase Auth is wired up and sign-in can actually work. */
export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

/** Which variables are still missing, for the setup screen to list. */
export function missingSupabaseVars(): string[] {
  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.supabaseAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return missing;
}
