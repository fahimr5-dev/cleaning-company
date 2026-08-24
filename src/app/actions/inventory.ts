"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { quantityOnHand, signedQuantity, nextMaintenanceDue, consumablesCostFils } from "@/lib/stock";

/**
 * Stock in, stock out, and servicing the machines.
 *
 * PLAIN ENGLISH: the quantity on the shelf is never typed in directly. It is
 * always the sum of every movement, so any number on the screen can be traced
 * back to a purchase, an issue to a team, a return, wastage or a stock count.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MOVEMENT_TYPES = ["PURCHASE", "ISSUE_TO_TEAM", "RETURN", "ADJUSTMENT", "WASTAGE"] as const;

const movementSchema = z.object({
  itemId: z.string().uuid(),
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.coerce.number().refine((n) => n !== 0, "Enter a quantity."),
  unitCostFils: z.coerce.number().int().min(0).max(100_000_000).optional(),
  teamId: z.string().uuid().optional(),
  jobId: z.string().uuid().optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  locale: z.string().max(5).default("en"),
});

/**
 * Records a stock movement and recalculates what is on the shelf.
 *
 * The sign is taken from the movement TYPE, not from however the number was
 * typed: "issue 5" always removes 5, even if somebody entered it as -5.
 */
export async function recordStockMovementAction(
  raw: unknown,
): Promise<Result<{ onHand: number; wentNegative: boolean }>> {
  const parsed = movementSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That movement was not valid." };
  }
  const { itemId, type, quantity, unitCostFils, teamId, jobId, reference, note, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const item = await prisma.inventoryItem.findFirst({
    where: { id: itemId, deletedAt: null },
    select: { id: true, sku: true, nameEn: true, unit: true, unitCostFils: true },
  });
  if (!item) return { ok: false, error: "That item no longer exists." };

  const onHand = await prisma.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: {
        itemId, type, quantity,
        unitCostFils: unitCostFils ?? item.unitCostFils,
        teamId: teamId || null,
        jobId: jobId || null,
        staffId: null,
        reference: reference || null,
        note: note || null,
        createdById: user.id,
      },
    });

    // Always re-derived from the movements, never incremented in place — that
    // is how a running total drifts away from the truth.
    const all = await tx.stockMovement.findMany({
      where: { itemId },
      select: { type: true, quantity: true },
    });
    const total = quantityOnHand(all.map((m) => ({ type: m.type, quantity: Number(m.quantity) })));

    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { currentQty: total },
    });
    return total;
  });

  await recordAudit({
    action: "UPDATE",
    entity: "InventoryItem",
    entityId: itemId,
    summary:
      `${item.sku}: ${type.replace(/_/g, " ").toLowerCase()} ` +
      `${signedQuantity({ type, quantity })} ${item.unit.toLowerCase()} — now ${onHand} on hand`,
  });

  revalidatePath(`/${locale}/inventory`);
  return { ok: true, onHand, wentNegative: onHand < 0 };
}

const consumableSchema = z.object({
  jobId: z.string().uuid(),
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive("Enter how much was used."),
  locale: z.string().max(5).default("en"),
});

/**
 * Charges materials to a job AND takes them off the shelf in one step.
 *
 * These are the same event: the chemical left the store because it was used on
 * that job. Recording them separately is how the two numbers drift apart.
 */
export async function chargeConsumableAction(
  raw: unknown,
): Promise<Result<{ costFils: number }>> {
  const parsed = consumableSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That was not valid." };
  }
  const { jobId, itemId, quantity, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const [job, item] = await Promise.all([
    prisma.job.findFirst({ where: { id: jobId, deletedAt: null }, select: { id: true, jobNo: true, teamId: true } }),
    prisma.inventoryItem.findFirst({ where: { id: itemId, deletedAt: null }, select: { id: true, sku: true, unitCostFils: true } }),
  ]);
  if (!job) return { ok: false, error: "That job no longer exists." };
  if (!item) return { ok: false, error: "That item no longer exists." };

  const costFils = consumablesCostFils([{ quantity, unitCostFils: item.unitCostFils }]);

  await prisma.$transaction(async (tx) => {
    await tx.jobConsumable.upsert({
      where: { jobId_itemId: { jobId, itemId } },
      create: { jobId, itemId, quantity, costFils },
      update: { quantity, costFils },
    });

    await tx.stockMovement.create({
      data: {
        itemId, jobId, type: "ISSUE_TO_TEAM",
        quantity, unitCostFils: item.unitCostFils,
        teamId: job.teamId, createdById: user.id,
        note: `Used on ${job.jobNo}`,
      },
    });

    const all = await tx.stockMovement.findMany({
      where: { itemId },
      select: { type: true, quantity: true },
    });
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: {
        currentQty: quantityOnHand(all.map((m) => ({ type: m.type, quantity: Number(m.quantity) }))),
      },
    });
  });

  revalidatePath(`/${locale}/inventory`);
  return { ok: true, costFils };
}

const maintenanceSchema = z.object({
  equipmentId: z.string().uuid(),
  type: z.enum(["SCHEDULED", "REPAIR", "INSPECTION"]),
  performedAt: z.string(),
  costFils: z.coerce.number().int().min(0).max(100_000_000).default(0),
  vendor: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  returnToService: z.boolean().default(true),
  locale: z.string().max(5).default("en"),
});

/**
 * Records a service and schedules the next one automatically from the
 * machine's own interval, so nothing falls off the calendar.
 */
export async function recordMaintenanceAction(
  raw: unknown,
): Promise<Result<{ nextDueAt: string | null }>> {
  const parsed = maintenanceSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Those service details were not valid." };
  const { equipmentId, type, performedAt, costFils, vendor, notes, returnToService, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const machine = await prisma.equipment.findFirst({
    where: { id: equipmentId, deletedAt: null },
    select: { id: true, assetTag: true, nameEn: true, maintenanceIntervalDays: true, status: true },
  });
  if (!machine) return { ok: false, error: "That machine no longer exists." };

  const done = new Date(performedAt);
  if (Number.isNaN(done.getTime())) return { ok: false, error: "That date was not valid." };

  const nextDueAt = nextMaintenanceDue(done, machine.maintenanceIntervalDays);

  await prisma.$transaction(async (tx) => {
    await tx.equipmentMaintenance.create({
      data: {
        equipmentId, type, performedAt: done, costFils,
        vendor: vendor || null, notes: notes || null,
        nextDueAt, recordedById: user.id,
      },
    });
    await tx.equipment.update({
      where: { id: equipmentId },
      data: {
        lastMaintenanceAt: done,
        nextMaintenanceDueAt: nextDueAt,
        ...(returnToService ? { status: "IN_SERVICE" } : {}),
      },
    });
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Equipment",
    entityId: equipmentId,
    summary:
      `${machine.assetTag} serviced (${type.toLowerCase()})` +
      (nextDueAt ? `, next due ${nextDueAt.toISOString().slice(0, 10)}` : ", no interval set"),
  });

  revalidatePath(`/${locale}/inventory`);
  return { ok: true, nextDueAt: nextDueAt?.toISOString() ?? null };
}

const statusSchema = z.object({
  equipmentId: z.string().uuid(),
  status: z.enum(["IN_SERVICE", "IN_REPAIR", "RETIRED", "LOST"]),
  locale: z.string().max(5).default("en"),
});

/** Marks a machine as in for repair, retired or lost. */
export async function setEquipmentStatusAction(raw: unknown): Promise<Result> {
  const parsed = statusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { equipmentId, status, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const machine = await prisma.equipment.findFirst({
    where: { id: equipmentId, deletedAt: null },
    select: { id: true, assetTag: true, status: true },
  });
  if (!machine) return { ok: false, error: "That machine no longer exists." };

  await prisma.equipment.update({ where: { id: equipmentId }, data: { status } });

  await recordAudit({
    action: "UPDATE",
    entity: "Equipment",
    entityId: equipmentId,
    summary: `${machine.assetTag}: ${machine.status.toLowerCase()} → ${status.toLowerCase()}`,
  });

  revalidatePath(`/${locale}/inventory`);
  return { ok: true };
}
