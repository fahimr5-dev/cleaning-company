"use client";

import { useTransition } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LABELS: Record<string, string> = { en: "English", ar: "العربية" };

/**
 * Switches between English and Arabic, keeping you on the same screen.
 * Choosing Arabic also flips the whole layout right-to-left.
 */
export function LocaleSwitcher({ current }: { current: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" disabled={isPending} aria-label={t("language")} />}
      >
        <Languages className="size-4" aria-hidden />
        <span className="hidden sm:inline">{LABELS[current] ?? current}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {routing.locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            disabled={locale === current}
            onClick={() =>
              startTransition(() => {
                // @ts-expect-error -- params carries the dynamic route segments
                router.replace({ pathname, params }, { locale });
              })
            }
          >
            {LABELS[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
