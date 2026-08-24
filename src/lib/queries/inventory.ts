import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { quantityOnHand, stockStatus, maintenanceStatus } from "@/lib/stock";

/** Reads for the inventory list, the stock ledger and the equipment register. */

export type ItemRow = {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  onHand: number;
  reorderLevel: number;
  level: string;
  suggestedOrderQty: number;
  unitCostFils: number;
  stockValueFils: number;
  supplier: string | null;
  storageLocation: string | null;
  usedLast30: number;
};

export async function getInventory(options: {
  search?: string;
  level?: string;
  locale: "en" | "ar";
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const search = options.search?.trim();

  const where: Prisma.InventoryItemWhereInput = {
    deletedAt: null,
    isActive: true,
    ...(search
      ? {
          OR: [
            { sku: { contains: search, mode: "insensitive" } },
            { nameEn: { contains: search, mode: "insensitive" } },
            { nameAr: { contains: search } },
            { supplier: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const items = await prisma.inventoryItem.findMany({
    where,
    orderBy: { nameEn: "asc" },
    select: {
      id: true, sku: true, nameEn: true, nameAr: true, category: true, unit: true,
      reorderLevel: true, unitCostFils: true, supplier: true, storageLocation: true,
      movements: {
        select: { type: true, quantity: true, occurredAt: true },
      },
    },
  });

  const rows = items.map((item): ItemRow => {
    const movements = item.movements.map((m) => ({ type: m.type, quantity: Number(m.quantity) }));
    const onHand = quantityOnHand(movements);
    const status = stockStatus({ onHand, reorderLevel: Number(item.reorderLevel) });

    const usedLast30 = item.movements
      .filter((m) => m.type === "ISSUE_TO_TEAM" && m.occurredAt >= thirtyDaysAgo)
      .reduce((total, m) => total + Math.abs(Number(m.quantity)), 0);

    return {
      id: item.id,
      sku: item.sku,
      name: options.locale === "ar" ? item.nameAr : item.nameEn,
      category: item.category,
      unit: item.unit,
      onHand,
      reorderLevel: Number(item.reorderLevel),
      level: status.level,
      suggestedOrderQty: status.suggestedOrderQty,
      unitCostFils: item.unitCostFils,
      stockValueFils: Math.round(onHand * item.unitCostFils),
      supplier: item.supplier,
      storageLocation: item.storageLocation,
      usedLast30: Math.round(usedLast30 * 1000) / 1000,
    };
  });

  const filtered = options.level && options.level !== "ALL"
    ? rows.filter((r) =>
        options.level === "NEEDS_ORDER"
          ? r.level === "REORDER" || r.level === "OUT_OF_STOCK"
          : r.level === options.level)
    : rows;

  // Anything you cannot do a job without comes first.
  const rank = { OUT_OF_STOCK: 0, REORDER: 1, LOW: 2, OK: 3 } as Record<string, number>;
  filtered.sort((a, b) => (rank[a.level] ?? 9) - (rank[b.level] ?? 9) || a.name.localeCompare(b.name));

  return {
    rows: filtered,
    total: filtered.length,
    summary: {
      itemCount: rows.length,
      needsOrdering: rows.filter((r) => r.level === "REORDER" || r.level === "OUT_OF_STOCK").length,
      outOfStock: rows.filter((r) => r.level === "OUT_OF_STOCK").length,
      stockValueFils: rows.reduce((total, r) => total + r.stockValueFils, 0),
    },
  };
}

/** The last movements in and out, so a quantity is always explainable. */
export async function getStockLedger(limit = 25) {
  const movements = await prisma.stockMovement.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: {
      id: true, type: true, quantity: true, occurredAt: true, note: true, reference: true,
      item: { select: { id: true, sku: true, nameEn: true, nameAr: true, unit: true } },
      team: { select: { name: true } },
      job: { select: { jobNo: true } },
      staff: { select: { firstName: true, lastName: true } },
    },
  });

  return movements.map((m) => ({
    id: m.id,
    type: m.type,
    quantity: Number(m.quantity),
    itemId: m.item.id,
    sku: m.item.sku,
    nameEn: m.item.nameEn,
    nameAr: m.item.nameAr,
    unit: m.item.unit,
    occurredAt: m.occurredAt.toISOString(),
    teamName: m.team?.name ?? null,
    jobNo: m.job?.jobNo ?? null,
    staffName: m.staff ? `${m.staff.firstName} ${m.staff.lastName}` : null,
    note: m.note ?? m.reference ?? null,
  }));
}

/** The machines, and which of them are due a service. */
export async function getEquipment(options: { locale: "en" | "ar"; now?: Date }) {
  const now = options.now ?? new Date();

  const equipment = await prisma.equipment.findMany({
    where: { deletedAt: null },
    orderBy: { nextMaintenanceDueAt: "asc" },
    select: {
      id: true, assetTag: true, nameEn: true, nameAr: true, category: true,
      status: true, serialNumber: true, purchaseCostFils: true,
      maintenanceIntervalDays: true, lastMaintenanceAt: true, nextMaintenanceDueAt: true,
      assignedTeam: { select: { name: true } },
      assignedStaff: { select: { firstName: true, lastName: true } },
      maintenanceRecords: {
        orderBy: { performedAt: "desc" },
        take: 1,
        select: { performedAt: true, costFils: true, type: true, vendor: true },
      },
    },
  });

  const rows = equipment.map((machine) => {
    const check = maintenanceStatus({
      status: machine.status,
      nextDueAt: machine.nextMaintenanceDueAt,
      now,
    });

    return {
      id: machine.id,
      assetTag: machine.assetTag,
      name: options.locale === "ar" ? machine.nameAr : machine.nameEn,
      category: machine.category,
      status: machine.status,
      serialNumber: machine.serialNumber,
      purchaseCostFils: machine.purchaseCostFils,
      holder: machine.assignedTeam?.name
        ?? (machine.assignedStaff ? `${machine.assignedStaff.firstName} ${machine.assignedStaff.lastName}` : null),
      maintenanceStatus: check.status,
      daysUntilDue: check.daysUntilDue,
      withhold: check.withhold,
      nextDueAt: machine.nextMaintenanceDueAt?.toISOString() ?? null,
      lastServiceAt: machine.maintenanceRecords[0]?.performedAt?.toISOString() ?? null,
      lastServiceCostFils: machine.maintenanceRecords[0]?.costFils ?? 0,
    };
  });

  // Overdue first — a machine that should not go out today is the urgent one.
  const rank = { OVERDUE: 0, DUE_SOON: 1, NOT_SCHEDULED: 2, SCHEDULED: 3 } as Record<string, number>;
  rows.sort((a, b) => (rank[a.maintenanceStatus] ?? 9) - (rank[b.maintenanceStatus] ?? 9));

  return {
    rows,
    summary: {
      total: rows.length,
      withheld: rows.filter((r) => r.withhold).length,
      overdue: rows.filter((r) => r.maintenanceStatus === "OVERDUE").length,
      dueSoon: rows.filter((r) => r.maintenanceStatus === "DUE_SOON").length,
      valueFils: rows.reduce((total, r) => total + r.purchaseCostFils, 0),
    },
  };
}
