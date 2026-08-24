import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground text-6xl font-bold">404</p>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Button render={<Link href="/" />}>{t("back")}</Button>
    </main>
  );
}
