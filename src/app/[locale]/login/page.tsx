import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Sparkles } from "lucide-react";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { LoginForm } from "./login-form";
import { SetupNotice } from "@/components/common/setup-notice";

/**
 * Never cache this page: what it shows depends on who is signed in. Without
 * this, Next.js can prerender the signed-out version at build time and then
 * serve everybody a redirect to the login screen.
 */
export const dynamic = "force-dynamic";


export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "login" });
  return { title: t("title") };
}

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("login");
  const tApp = await getTranslations("app");

  // Nothing to log into until Supabase is connected — say so plainly instead of
  // showing a form that cannot possibly work.
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const user = await getCurrentUser();
  if (user) redirect(`/${locale}${homePathFor(user.role)}`);

  return (
    <main className="bg-muted/40 flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <span className="bg-primary text-primary-foreground rounded-xl p-2.5">
            <Sparkles className="size-6" aria-hidden />
          </span>
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>

        <LoginForm locale={locale} />

        <p className="text-muted-foreground mt-8 text-center text-xs">{tApp("tagline")}</p>
      </div>
    </main>
  );
}
