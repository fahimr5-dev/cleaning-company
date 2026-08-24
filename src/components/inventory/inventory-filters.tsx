"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Search and filter the stock list. The filters live in the address bar. */
export function InventoryFilters({ total }: { total: number }) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
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
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const level = params.get("level") ?? "ALL";
  const chip = (active: boolean) =>
    cn("rounded-full border px-3 py-1 text-xs transition-colors",
      active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent");

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 start-3" aria-hidden />
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
        <span className="text-muted-foreground text-xs">{t("filters.level")}</span>
        {(["ALL", "NEEDS_ORDER", "OUT_OF_STOCK", "LOW", "OK"] as const).map((value) => (
          <button
            key={value}
            type="button"
            data-testid={`stock-filter-${value}`}
            className={chip(level === value)}
            onClick={() => setFilter("level", value)}
          >
            {t(`filters.levelValues.${value}`)}
          </button>
        ))}
        <span className="text-muted-foreground ms-auto text-xs tabular-nums">
          {t("resultCount", { count: total })}
        </span>
      </div>
    </div>
  );
}
