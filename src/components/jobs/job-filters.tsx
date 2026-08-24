"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Search and filters for the job list, kept in the address bar. */
export function JobFilters({
  teams, total,
}: {
  teams: { id: string; name: string; nameAr: string | null }[];
  total: number;
}) {
  const t = useTranslations("jobs");
  const tStatus = useTranslations("jobStatus");
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
      next.delete("page");
      if (next.toString() !== params.toString()) {
        startTransition(() => router.replace(`${pathname}?${next.toString()}`));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [search, params, pathname, router]);

  /**
   * `removeOn` is the value that means "no filter", so the address stays clean.
   * The time filter has no such value — "Upcoming" and "All" are both real
   * choices — so it is always written out in full.
   */
  function setFilter(key: string, value: string, removeOn?: string) {
    const next = new URLSearchParams(params.toString());
    if (removeOn !== undefined && value === removeOn) next.delete(key);
    else next.set(key, value);
    next.delete("page");
    startTransition(() => router.replace(`${pathname}?${next.toString()}`));
  }

  const when = params.get("when") ?? "UPCOMING";
  const status = params.get("status") ?? "ALL";
  const teamId = params.get("teamId") ?? "ALL";

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
        {pending ? <Loader2 className="text-muted-foreground absolute top-1/2 size-4 -translate-y-1/2 end-3 animate-spin" aria-hidden /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{t("filters.when")}</span>
        {(["UPCOMING", "PAST", "ALL"] as const).map((v) => (
          <button key={v} type="button" className={chip(when === v)} onClick={() => setFilter("when", v)}>
            {t(`filters.whenValues.${v}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{t("filters.status")}</span>
        <button type="button" className={chip(status === "ALL")} onClick={() => setFilter("status", "ALL", "ALL")}>
          {t("filters.all")}
        </button>
        {(["SCHEDULED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_ACCESS"] as const).map((v) => (
          <button key={v} type="button" className={chip(status === v)} onClick={() => setFilter("status", v, "ALL")}>
            {tStatus(v)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">{t("filters.team")}</span>
        <button type="button" className={chip(teamId === "ALL")} onClick={() => setFilter("teamId", "ALL", "ALL")}>
          {t("filters.all")}
        </button>
        {teams.map((team) => (
          <button key={team.id} type="button" className={chip(teamId === team.id)} onClick={() => setFilter("teamId", team.id, "ALL")}>
            {team.name}
          </button>
        ))}
        <span className="text-muted-foreground ms-auto text-xs tabular-nums">
          {t("resultCount", { count: total })}
        </span>
      </div>
    </div>
  );
}
