"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { toast } from "sonner";
import type { FieldChecklistItem } from "@/lib/field-shared";
import { toggleChecklistItemAction } from "@/app/actions/field";
import { cn } from "@/lib/utils";

/**
 * The digital checklist.
 *
 * Ticking is optimistic — the box fills the instant it is tapped, because a
 * cleaner on a weak signal should not be waiting on a spinner. If the save
 * fails the tick springs back and an error is shown.
 */
export function FieldChecklist({
  jobId, items, locale, readOnly,
}: {
  jobId: string;
  items: FieldChecklistItem[];
  locale: "en" | "ar";
  readOnly: boolean;
}) {
  const t = useTranslations("field.checklist");
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [optimistic, setOptimistic] = useOptimistic(
    items,
    (state: FieldChecklistItem[], update: { id: string; isChecked: boolean }) =>
      state.map((i) => (i.id === update.id ? { ...i, isChecked: update.isChecked } : i)),
  );

  const sections = optimistic.reduce<Record<string, FieldChecklistItem[]>>((acc, item) => {
    const key = item.section ?? "";
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

  const outstanding = optimistic.filter((i) => i.isMandatory && !i.isChecked).length;

  function toggle(item: FieldChecklistItem) {
    if (readOnly) return;
    const next = !item.isChecked;
    startTransition(async () => {
      setOptimistic({ id: item.id, isChecked: next });
      const result = await toggleChecklistItemAction({
        itemId: item.id, jobId, isChecked: next, locale,
      });
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-muted-foreground py-4 text-center text-sm">{t("none")}</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("progress", {
          done: optimistic.filter((i) => i.isChecked).length,
          total: optimistic.length,
        })}
        {outstanding > 0 ? ` · ${t("outstanding", { count: outstanding })}` : ""}
      </p>

      {Object.entries(sections).map(([section, sectionItems]) => (
        <div key={section}>
          {section ? (
            <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
              {section}
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {sectionItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  data-testid="checklist-item"
                  data-checked={item.isChecked}
                  data-mandatory={item.isMandatory}
                  disabled={readOnly}
                  onClick={() => toggle(item)}
                  aria-pressed={item.isChecked}
                  className={cn(
                    // A big row, because this is tapped with a gloved thumb.
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-start transition-colors",
                    item.isChecked ? "bg-green-50 border-green-300 dark:bg-green-950/40 dark:border-green-800" : "bg-card",
                    readOnly && "opacity-70",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md border-2",
                      item.isChecked
                        ? "border-green-600 bg-green-600 text-white"
                        : item.isMandatory
                          ? "border-amber-500"
                          : "border-muted-foreground/40",
                    )}
                    aria-hidden
                  >
                    {item.isChecked ? <Check className="size-4" strokeWidth={3} /> : null}
                  </span>

                  <span className={cn("min-w-0 flex-1 text-sm", item.isChecked && "line-through opacity-70")}>
                    {locale === "ar" ? item.labelAr : item.labelEn}
                  </span>

                  {item.isMandatory ? (
                    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                      {t("required")}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
