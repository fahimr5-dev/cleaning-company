"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { navFor } from "./nav-items";
import type { AppRole } from "@/lib/auth";

/**
 * The left-hand navigation. Links a role is not allowed to open are never
 * rendered at all, so nobody can click into a screen they cannot use.
 * Screens from later phases are shown greyed out with their phase number,
 * so the founder can see the shape of the finished product.
 */
export function SidebarNav({
  role,
  locale,
  onNavigate,
}: {
  role: AppRole;
  locale: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6 p-3">
      {navFor(role).map((section) => (
        <div key={section.key}>
          <p className="text-muted-foreground px-3 pb-2 text-[11px] font-medium tracking-wider uppercase">
            {t(`sections.${section.key}`)}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const href = `/${locale}${item.href}`;
              const active = pathname === href || pathname.startsWith(`${href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="truncate">{t(item.key)}</span>
                    {item.phase ? (
                      <span className="border-muted-foreground/30 text-muted-foreground ms-auto rounded border px-1.5 py-px text-[10px] font-medium">
                        P{item.phase}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
