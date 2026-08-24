"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, PackagePlus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recordStockMovementAction, recordMaintenanceAction } from "@/app/actions/inventory";

const MOVEMENT_TYPES = ["PURCHASE", "ISSUE_TO_TEAM", "RETURN", "WASTAGE", "ADJUSTMENT"] as const;

/**
 * Recording stock in or out.
 *
 * PLAIN ENGLISH: you never type "how many we have". You record what happened —
 * bought 24, issued 6 to Team A, threw 1 away — and the quantity on the shelf
 * is worked out from those. That way any number can be explained.
 */
export function StockMovementDialog({
  item, locale,
}: {
  item: { id: string; sku: string; name: string; unit: string; onHand: number };
  locale: "en" | "ar";
}) {
  const t = useTranslations("inventory.movement");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof MOVEMENT_TYPES)[number]>("PURCHASE");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [busy, startBusy] = useTransition();

  const amount = Number(quantity) || 0;
  const removes = type === "ISSUE_TO_TEAM" || type === "WASTAGE";
  const projected =
    type === "ADJUSTMENT" ? item.onHand + amount : item.onHand + (removes ? -amount : amount);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PackagePlus className="size-4" aria-hidden />
        {t("button")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
          <DialogDescription>
            {t("onHand", { qty: item.onHand, unit: t(`units.${item.unit}`) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t("what")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  data-testid={`movement-${value}`}
                  onClick={() => setType(value)}
                  className={
                    type === value
                      ? "border-primary bg-primary text-primary-foreground rounded-lg border px-3 py-2 text-xs"
                      : "hover:bg-accent rounded-lg border px-3 py-2 text-xs"
                  }
                >
                  {t(`types.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="movement-qty">
              {type === "ADJUSTMENT" ? t("adjustBy") : t("quantity")}
            </Label>
            <Input
              id="movement-qty"
              type="number"
              step="0.001"
              dir="ltr"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="mt-1.5 tabular-nums"
            />
            <p className={`mt-1.5 text-xs ${projected < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
              {projected < 0
                ? t("wouldGoNegative", { qty: projected })
                : t("afterwards", { qty: Math.round(projected * 1000) / 1000 })}
            </p>
          </div>

          <div>
            <Label htmlFor="movement-note">{t("note")}</Label>
            <Textarea
              id="movement-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1.5"
              placeholder={t("notePlaceholder")}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button
            disabled={busy || amount === 0}
            data-testid="save-movement"
            onClick={() =>
              startBusy(async () => {
                const result = await recordStockMovementAction({
                  itemId: item.id, type, quantity: amount, note, locale,
                });
                if (!result.ok) { toast.error(result.error); return; }
                if (result.wentNegative) {
                  toast.warning(t("negativeWarning", { qty: result.onHand }));
                } else {
                  toast.success(t("saved", { qty: result.onHand, unit: t(`units.${item.unit}`) }));
                }
                setOpen(false);
                router.refresh();
              })
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Recording a service, which schedules the next one automatically. */
export function MaintenanceDialog({
  machine, locale,
}: {
  machine: { id: string; assetTag: string; name: string };
  locale: "en" | "ar";
}) {
  const t = useTranslations("inventory.maintenance");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"SCHEDULED" | "REPAIR" | "INSPECTION">("SCHEDULED");
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState("0");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, startBusy] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <Wrench className="size-4" aria-hidden />
        {t("button")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{machine.name}</DialogTitle>
          <DialogDescription>{t("body", { tag: machine.assetTag })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t("what")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["SCHEDULED", "REPAIR", "INSPECTION"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                  className={
                    type === value
                      ? "border-primary bg-primary text-primary-foreground rounded-lg border px-3 py-2 text-xs"
                      : "hover:bg-accent rounded-lg border px-3 py-2 text-xs"
                  }
                >
                  {t(`types.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="maint-date">{t("when")}</Label>
              <Input
                id="maint-date"
                type="date"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="maint-cost">{t("cost")}</Label>
              <Input
                id="maint-cost"
                type="number"
                step="0.01"
                min="0"
                dir="ltr"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="mt-1.5 tabular-nums"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="maint-vendor">{t("vendor")}</Label>
            <Input
              id="maint-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              maxLength={120}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="maint-notes">{t("notes")}</Label>
            <Textarea
              id="maint-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button
            disabled={busy}
            data-testid="save-maintenance"
            onClick={() =>
              startBusy(async () => {
                const result = await recordMaintenanceAction({
                  equipmentId: machine.id,
                  type,
                  performedAt: new Date(performedAt).toISOString(),
                  costFils: Math.round((Number(cost) || 0) * 100),
                  vendor, notes, returnToService: true, locale,
                });
                if (!result.ok) { toast.error(result.error); return; }
                toast.success(
                  result.nextDueAt
                    ? t("savedWithNext", { date: result.nextDueAt.slice(0, 10) })
                    : t("savedNoInterval"),
                );
                setOpen(false);
                router.refresh();
              })
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
