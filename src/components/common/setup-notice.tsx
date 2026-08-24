import { getTranslations } from "next-intl/server";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { missingSupabaseVars } from "@/lib/env";

/**
 * Shown instead of the login form when Supabase is not connected.
 *
 * The alternative would be a sign-in box that silently fails, which is exactly
 * the kind of thing that wastes an afternoon.
 */
export async function SetupNotice() {
  const t = await getTranslations("setup");
  const missing = missingSupabaseVars();

  return (
    <main className="bg-muted/40 flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-lg border-amber-300 dark:border-amber-800">
        <CardHeader>
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-5" aria-hidden />
            <CardTitle className="text-lg">{t("title")}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">{t("intro")}</p>

          <div>
            <p className="mb-2 font-medium">{t("missing")}</p>
            <ul className="space-y-1">
              {missing.map((name) => (
                <li key={name}>
                  <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs" dir="ltr">
                    {name}
                  </code>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-muted-foreground">{t("where")}</p>
          <p className="text-muted-foreground">{t("docs")}</p>
        </CardContent>
      </Card>
    </main>
  );
}
