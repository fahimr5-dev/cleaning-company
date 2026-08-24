import { getTranslations } from "next-intl/server";
import { Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * A deliberately empty screen for a feature that is not built yet.
 *
 * This exists so an unbuilt screen is UNMISTAKABLY unbuilt. It never pretends
 * to work, never shows fake data, and always names the phase that will deliver
 * it. If you see this page, the feature genuinely does not exist yet.
 */
export async function TodoScreen({
  feature,
  phase,
  willInclude,
}: {
  feature: string;
  phase: number;
  willInclude: string[];
}) {
  const t = await getTranslations("todo");

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold tracking-wide text-amber-900 uppercase dark:bg-amber-950 dark:text-amber-200">
              <Construction className="size-3.5" aria-hidden />
              {t("badge")}
            </span>
          </div>
          <CardTitle className="mt-3 text-xl">
            {t("heading", { feature, phase })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-muted-foreground text-sm">{t("body")}</p>
          <div>
            <p className="mb-2 text-sm font-medium">{t("willInclude")}</p>
            <ul className="text-muted-foreground list-inside list-disc space-y-1.5 text-sm">
              {willInclude.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
