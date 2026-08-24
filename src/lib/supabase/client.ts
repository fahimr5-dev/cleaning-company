"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/**
 * The Supabase connection used inside the browser.
 *
 * It carries the signed-in person's identity, which means every query it makes
 * is checked against the database's Row Level Security rules. This is the
 * connection the cleaner app and the client portal use.
 */
export function createClient() {
  return createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
}
