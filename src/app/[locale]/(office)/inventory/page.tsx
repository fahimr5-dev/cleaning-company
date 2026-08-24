import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Package, ShoppingCart, Wallet, Wrench } from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getInventory, getStockLedger, getEquipment } from "@/lib/queries/inventory";
import { formatMoney } from "@/lib/money";
import { StatCard } from "@/components/common/stat-card";
import { StockMovementDialog, MaintenanceDialog } from "@/components/inventory/inventory-actions";
import { InventoryFilters } from "@/components/inventory/inventory-filters";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Auth-dependent, so it must be rendered per request and never prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("inventory") };
}

const LEVEL_TONE: Record<string, string> = {
  OUT_OF_STOCK: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  REORDER: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  LOW: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

const MAINTENANCE_TONE: Record<string, string> = {
  OVERDUE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  DUE_SOON: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  NOT_SCHEDULED: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
};

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(locale, ...OFFICE_ROLES);

  const t = await getTranslations("inventory");
  const isArabic = locale === "ar";
  const lang: "en" | "ar" = isArabic ? "ar" : "en";
  const money = (fils: number) => formatMoney(fils, lang);
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short",
  });

  const stock = await getInventory({ search: one(sp.q), level: one(sp.level), locale: lang });
  const ledger = await getStockLedger(12);
  const equipment = await getEquipment({ locale: lang });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Package} label={t("stats.items")} value={num.format(stock.summary.itemCount)} />
        <StatCard
          icon={ShoppingCart}
          label={t("stats.needsOrder")}
          value={num.format(stock.summary.needsOrdering)}
          hint={t("stats.needsOrderHint", { out: num.format(stock.summary.outOfStock) })}
          tone={stock.summary.needsOrdering > 0 ? "warning" : "default"}
        />
        <StatCard
          icon={Wallet}
          label={t("stats.stockValue")}
          value={money(stock.summary.stockValueFils)}
          hint={t("stats.stockValueHint")}
        />
        <StatCard
          icon={Wrench}
          label={t("stats.machinesDown")}
          value={num.format(equipment.summary.withheld)}
          hint={t("stats.machinesDownHint")}
          tone={equipment.summary.withheld > 0 ? "danger" : "default"}
        />
      </div>

      <InventoryFilters total={stock.total} />

      {stock.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t("table.item")}</th>
                  <th className="p-3 text-end font-medium">{t("table.onHand")}</th>
                  <th className="p-3 text-end font-medium">{t("table.reorderAt")}</th>
                  <th className="p-3 text-end font-medium">{t("table.used30")}</th>
                  <th className="p-3 text-end font-medium">{t("table.value")}</th>
                  <th className="p-3 text-start font-medium">{t("table.status")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {stock.rows.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/40 border-t" data-testid="item-row" data-level={item.level}>
                    <td className="p-3">
                      <span className="font-medium">{item.name}</span>
                      <div className="text-muted-foreground mt-0.5 text-xs">
                        {item.sku}
                        {item.storageLocation ? ` · ${item.storageLocation}` : ""}
                      </div>
                    </td>
                    <td className="p-3 text-end tabular-nums" data-testid="on-hand">
                      {num.format(item.onHand)}
                      <span className="text-muted-foreground ms-1 text-xs">{t(`movement.units.${item.unit}`)}</span>
                    </td>
                    <td className="text-muted-foreground p-3 text-end tabular-nums">{num.format(item.reorderLevel)}</td>
                    <td className="text-muted-foreground p-3 text-end tabular-nums">{num.format(item.usedLast30)}</td>
                    <td className="p-3 text-end tabular-nums">{money(item.stockValueFils)}</td>
                    <td className="p-3">
                      <Badge variant="secondary" data-level={item.level} className={cn(LEVEL_TONE[item.level])}>
                        {t(`levels.${item.level}`)}
                      </Badge>
                      {item.suggestedOrderQty > 0 && item.level !== "OK" && item.level !== "LOW" ? (
                        <span className="text-muted-foreground mt-1 block text-[11px]">
                          {t("orderSuggestion", { qty: num.format(item.suggestedOrderQty) })}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3 text-end">
                      <StockMovementDialog
                        item={{ id: item.id, sku: item.sku, name: item.name, unit: item.unit, onHand: item.onHand }}
                        locale={lang}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* The ledger — why the numbers above are what they are. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 text-sm font-medium">{t("ledger.title")}</h2>
            <p className="text-muted-foreground mb-3 text-xs">{t("ledger.hint")}</p>
            {ledger.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">{t("ledger.none")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {ledger.map((move) => {
                  const removes = move.type === "ISSUE_TO_TEAM" || move.type === "WASTAGE";
                  const size = Math.abs(move.quantity);
                  return (
                    <li key={move.id} className="flex items-start justify-between gap-3 py-2.5" data-testid="ledger-row">
                      <div className="min-w-0">
                        <p>{isArabic ? move.nameAr : move.nameEn}</p>
                        <p className="text-muted-foreground text-xs">
                          {t(`movement.types.${move.type}`)}
                          {move.teamName ? ` · ${move.teamName}` : ""}
                          {move.jobNo ? ` · ${move.jobNo}` : ""}
                          {" · "}
                          {dateFmt.format(new Date(move.occurredAt))}
                        </p>
                      </div>
                      <span className={cn(
                        "shrink-0 tabular-nums",
                        removes ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400",
                      )}>
                        {removes ? "−" : "+"}{num.format(size)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Machines. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 text-sm font-medium">{t("equipment.title")}</h2>
            <p className="text-muted-foreground mb-3 text-xs">
              {t("equipment.hint", {
                total: num.format(equipment.summary.total),
                overdue: num.format(equipment.summary.overdue),
              })}
            </p>
            {equipment.rows.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">{t("equipment.none")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {equipment.rows.map((machine) => (
                  <li key={machine.id} className="flex items-start justify-between gap-3 py-2.5" data-testid="equipment-row" data-maintenance={machine.maintenanceStatus}>
                    <div className="min-w-0">
                      <p className="font-medium">{machine.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {machine.assetTag}
                        {machine.holder ? ` · ${machine.holder}` : ` · ${t("equipment.unassigned")}`}
                      </p>
                      {machine.withhold ? (
                        <p className="text-xs text-red-700 dark:text-red-400">{t("equipment.withheld")}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-end">
                        <Badge
                          variant="secondary"
                          data-maintenance={machine.maintenanceStatus}
                          className={cn("text-[10px]", MAINTENANCE_TONE[machine.maintenanceStatus])}
                        >
                          {t(`equipment.status.${machine.maintenanceStatus}`)}
                        </Badge>
                        {machine.nextDueAt ? (
                          <p className="text-muted-foreground mt-0.5 text-[11px]">
                            {dateFmt.format(new Date(machine.nextDueAt))}
                          </p>
                        ) : null}
                      </div>
                      <MaintenanceDialog
                        machine={{ id: machine.id, assetTag: machine.assetTag, name: machine.name }}
                        locale={lang}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
