"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** The demo accounts the seed script creates, shown only in development. */
const DEMO_ACCOUNTS = [
  { email: "owner@cleanos.demo", role: "OWNER" },
  { email: "ops@cleanos.demo", role: "OPS_MANAGER" },
  { email: "cleaner@cleanos.demo", role: "CLEANER" },
  { email: "client@cleanos.demo", role: "CLIENT" },
];

export function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations("login");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(t("invalid"));
      setBusy(false);
      return;
    }

    // The server decides where this role belongs; `refresh` makes it re-read
    // the new session cookie before the redirect happens.
    router.refresh();
    router.replace(`/${locale}`);
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{tCommon("email")}</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                dir="ltr"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{tCommon("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("signingIn")}
                </>
              ) : (
                t("submit")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {process.env.NODE_ENV === "development" ? (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm font-medium">{t("demoTitle")}</p>
            <p className="text-muted-foreground mb-3 text-xs">
              {t("demoHint")} <code className="font-mono">CleanOS!2026</code>
            </p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(a.email);
                      setPassword("CleanOS!2026");
                    }}
                    className="hover:bg-accent flex w-full items-center justify-between rounded px-2 py-1 text-start text-xs"
                  >
                    <code className="font-mono" dir="ltr">{a.email}</code>
                    <span className="text-muted-foreground">{a.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
