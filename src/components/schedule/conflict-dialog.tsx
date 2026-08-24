"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Conflict } from "@/lib/scheduling";

/**
 * Shown when a move is possible but questionable.
 *
 * PLAIN ENGLISH: the software will not silently let you send one team to Marina
 * and Mirdif an hour apart, but it will not stop you either — you might know
 * the client rearranged the time. It states the problem and lets you decide.
 */
export function ConflictDialog({
  open, conflicts, locale, onCancel, onConfirm,
}: {
  open: boolean;
  conflicts: Conflict[];
  locale: "en" | "ar";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("schedule.conflict");

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-5 text-amber-600" aria-hidden />
            {t("title")}
          </DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {conflicts.map((conflict, i) => (
            <li key={i} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/50">
              {describe(conflict, t, locale)}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
          <Button onClick={onConfirm}>{t("confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Turns a conflict into a sentence a person can act on. */
function describe(
  conflict: Conflict,
  t: (key: string, values?: Record<string, string | number>) => string,
  locale: "en" | "ar",
): string {
  const d = conflict.detail;
  switch (conflict.code) {
    case "DOUBLE_BOOKED":
      return t("doubleBooked", { jobNo: String(d.jobNo ?? "") });
    case "TRAVEL_TIME":
      return t("travelTime", {
        from: String(d.fromJobNo ?? ""),
        to: String(d.toJobNo ?? ""),
        gap: Number(d.gapMinutes ?? 0),
        needed: Number(d.neededMinutes ?? 0),
        drive: Number(d.driveMinutes ?? 0),
      });
    case "OVER_CAPACITY":
      return t("overCapacity", {
        booked: Number(d.bookedMinutes ?? 0),
        capacity: Number(d.capacityMinutes ?? 0),
        over: Number(d.overBy ?? 0),
      });
    case "OUTSIDE_SHIFT":
      return t("outsideShift", { start: String(d.shiftStart ?? ""), end: String(d.shiftEnd ?? "") });
    case "NON_WORKING_DAY": {
      const weekday = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-AE", { weekday: "long" })
        .format(new Date(2026, 0, 4 + Number(d.weekday ?? 0)));
      return t("nonWorkingDay", { weekday });
    }
    case "TEAM_ON_LEAVE":
      return t("teamOnLeave");
  }
}
