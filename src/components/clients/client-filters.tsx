"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Search and filter the client list.
 *
 * The filters live in the address bar, so a filtered list can be bookmarked or
 * sent to a colleague and it opens exactly the same way.
 */
export function ClientFilters({ total }: { total: number }) {
  const t = useTranslations("clients");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");

  // Wait until typing stops before searching, so one query runs instead of ten.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      next.delete("page");
      const query = next.toString();
      if (query !== params.toString()) {
        startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ""}`));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, params, pathname, router]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value === "ALL") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const type = params.get("type") ?? "ALL";
  const status = params.get("status") ?? "ALL";

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
    );

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 start-3" aria-hidden />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="ps-9"
          aria-label={t("searchPlaceholder")}
        />
        {pending ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 size-4 -translate-y-1/2 end-3 animate-spin" aria-hidden />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{t("filters.type")}</span>
        {(["ALL", "RESIDENTIAL", "COMMERCIAL"] as const).map((value) => (
          <button key={value} type="button" className={chip(type === value)} onClick={() => setFilter("type", value)}>
            {t(`filters.typeValues.${value}`)}
          </button>
        ))}

        <span className="text-muted-foreground ms-3 text-xs">{t("filters.status")}</span>
        {(["ALL", "ACTIVE", "PAUSED", "CHURNED"] as const).map((value) => (
          <button key={value} type="button" className={chip(status === value)} onClick={() => setFilter("status", value)}>
            {t(`filters.statusValues.${value}`)}
          </button>
        ))}

        <span className="text-muted-foreground ms-auto text-xs tabular-nums">
          {t("resultCount", { count: total })}
        </span>
      </div>
    </div>
  );
}
