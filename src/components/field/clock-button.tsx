"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogIn, LogOut, Loader2, MapPinOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clockInAction, clockOutAction } from "@/app/actions/field";

/**
 * Clock in and out, with the phone's location attached.
 *
 * PLAIN ENGLISH: if the phone will not give us a location — no signal in a
 * basement, or permission refused — the cleaner is STILL clocked in. The
 * office sees a flag to look at later. Nobody is ever left standing in a
 * client's hallway unable to start work.
 */
export function ClockButton({
  jobId, state, locale,
}: {
  jobId: string;
  state: "NOT_CLOCKED_IN" | "CLOCKED_IN" | "CLOCKED_OUT";
  locale: "en" | "ar";
}) {
  const t = useTranslations("field.clock");
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [locating, setLocating] = useState(false);

  /** Asks the phone where it is, giving up rather than hanging. */
  function currentPosition(): Promise<{
    latitude: number; longitude: number; accuracyMetres: number;
  } | null> {
    if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 12_000);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMetres: pos.coords.accuracy,
          });
        },
        () => {
          clearTimeout(timer);
          resolve(null); // permission refused or unavailable — carry on regardless
        },
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
      );
    });
  }

  function run(kind: "IN" | "OUT") {
    setLocating(true);
    startBusy(async () => {
      const position = await currentPosition();
      setLocating(false);

      const action = kind === "IN" ? clockInAction : clockOutAction;
      const result = await action({ jobId, position, locale });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (result.reason === "NO_DEVICE_LOCATION") {
        toast.success(kind === "IN" ? t("clockedIn") : t("clockedOut"), {
          description: t("noLocation"),
        });
      } else if (result.flagged) {
        toast.success(kind === "IN" ? t("clockedIn") : t("clockedOut"), {
          description: t("farAway", { metres: result.distanceMetres ?? 0 }),
        });
      } else {
        toast.success(kind === "IN" ? t("clockedIn") : t("clockedOut"));
      }
      router.refresh();
    });
  }

  if (state === "CLOCKED_OUT") {
    return (
      <Button size="lg" className="w-full" disabled variant="outline">
        {t("finished")}
      </Button>
    );
  }

  const isIn = state === "CLOCKED_IN";

  return (
    <Button
      size="lg"
      className="h-14 w-full text-base"
      variant={isIn ? "outline" : "default"}
      disabled={busy}
      onClick={() => run(isIn ? "OUT" : "IN")}
    >
      {busy ? (
        <>
          <Loader2 className="size-5 animate-spin" aria-hidden />
          {locating ? t("findingYou") : t("saving")}
        </>
      ) : isIn ? (
        <>
          <LogOut className="size-5" aria-hidden />
          {t("clockOut")}
        </>
      ) : (
        <>
          <LogIn className="size-5" aria-hidden />
          {t("clockIn")}
        </>
      )}
    </Button>
  );
}

/** Shown on a job whose clock-in the office needs to look at. */
export function GeofenceFlag({ distanceMetres }: { distanceMetres: number | null }) {
  const t = useTranslations("field.clock");
  return (
    <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
      <MapPinOff className="size-4 shrink-0" aria-hidden />
      {distanceMetres === null ? t("noLocation") : t("farAway", { metres: distanceMetres })}
    </p>
  );
}
