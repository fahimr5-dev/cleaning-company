import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { isSupabaseConfigured } from "@/lib/env";
import { routing } from "@/i18n/routing";

/**
 * Who is signed in, and what are they allowed to do.
 *
 * PLAIN ENGLISH: this is the app's OWN check, and it runs before any page
 * renders. The database's Row Level Security rules are the second, independent
 * check. Both have to agree before anyone sees anything.
 */

export type AppRole = "OWNER" | "OPS_MANAGER" | "CLEANER" | "CLIENT";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  role: AppRole;
  locale: "EN" | "AR";
  avatarUrl: string | null;
  staffId: string | null;
  clientId: string | null;
};

/**
 * The signed-in person, or null. `cache` means that even if six components on
 * one page ask, the database is only asked once per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.user.findFirst({
    where: { id: user.id, isActive: true, deletedAt: null },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      locale: true,
      avatarUrl: true,
      staff: { select: { id: true } },
      client: { select: { id: true } },
    },
  });

  // Signed in to Supabase but with no matching profile row. This happens if an
  // account was created in the Supabase dashboard without a matching users row.
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role as AppRole,
    locale: profile.locale as "EN" | "AR",
    avatarUrl: profile.avatarUrl,
    staffId: profile.staff?.id ?? null,
    clientId: profile.client?.id ?? null,
  };
});

/** The home screen each role should land on after signing in. */
export function homePathFor(role: AppRole): string {
  switch (role) {
    case "OWNER":
    case "OPS_MANAGER":
      return "/dashboard";
    case "CLEANER":
      return "/field";
    case "CLIENT":
      return "/portal";
  }
}

function localised(locale: string, path: string): string {
  const safe = routing.locales.includes(locale as never) ? locale : routing.defaultLocale;
  return `/${safe}${path}`;
}

/** Require somebody to be signed in; otherwise send them to the login screen. */
export async function requireUser(locale: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(localised(locale, "/login"));
  return user;
}

/**
 * Require one of the listed roles. Anyone signed in but not allowed is sent to
 * their own home screen rather than shown an error — a cleaner who taps an
 * admin link simply lands back on today's jobs.
 */
export async function requireRole(
  locale: string,
  ...allowed: AppRole[]
): Promise<CurrentUser> {
  const user = await requireUser(locale);
  if (!allowed.includes(user.role)) {
    redirect(localised(locale, homePathFor(user.role)));
  }
  return user;
}

/** Owner-only areas: financial settings, rate card, marketing spend. */
export const OFFICE_ROLES: AppRole[] = ["OWNER", "OPS_MANAGER"];
