"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { recordAudit, auditFields } from "@/lib/audit";

/** Editing a client's commercial settings, and pausing them from booking. */

type ActionResult = { ok: true } | { ok: false; error: string };

const settingsSchema = z.object({
  clientId: z.string().uuid(),
  billingMode: z.enum(["PER_JOB", "MONTHLY_CONSOLIDATED"]),
  paymentTermsDays: z.coerce.number().int().min(0).max(180),
  trn: z.string().trim().max(20).optional().or(z.literal("")),
  locale: z.string().max(5).default("en"),
});

export async function updateClientBillingAction(raw: unknown): Promise<ActionResult> {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Those settings are not valid." };
  const { clientId, billingMode, paymentTermsDays, trn, locale } = parsed.data;

  // Billing terms are money settings, so this is owner-only. An operations
  // manager can see them but cannot change them — the same rule the database
  // enforces independently.
  await requireRole(locale, "OWNER");

  const before = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, clientNo: true, billingMode: true, paymentTermsDays: true, trn: true },
  });
  if (!before) return { ok: false, error: "That client no longer exists." };

  const after = await prisma.client.update({
    where: { id: clientId },
    data: { billingMode, paymentTermsDays, trn: trn || null },
    select: { id: true, clientNo: true, billingMode: true, paymentTermsDays: true, trn: true },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Client",
    entityId: clientId,
    summary: `Changed billing settings for ${before.clientNo}`,
    before: auditFields(before, ["billingMode", "paymentTermsDays", "trn"]),
    after: auditFields(after, ["billingMode", "paymentTermsDays", "trn"]),
  });

  revalidatePath(`/${locale}/clients/${clientId}`);
  revalidatePath(`/${locale}/clients`);
  return { ok: true };
}

const pauseSchema = z.object({
  clientId: z.string().uuid(),
  paused: z.boolean(),
  reason: z.string().trim().max(300).optional().or(z.literal("")),
  locale: z.string().max(5).default("en"),
});

/**
 * Stops (or restarts) a client being able to book.
 *
 * Used for clients who owe money, or who have asked to pause their schedule.
 */
export async function setClientBookingPauseAction(raw: unknown): Promise<ActionResult> {
  const parsed = pauseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { clientId, paused, reason, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const before = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, clientNo: true, isBookingPaused: true, bookingPauseReason: true },
  });
  if (!before) return { ok: false, error: "That client no longer exists." };

  if (paused && !reason) {
    return { ok: false, error: "Please say why this client is being paused." };
  }

  await prisma.client.update({
    where: { id: clientId },
    data: {
      isBookingPaused: paused,
      bookingPauseReason: paused ? (reason ?? null) : null,
      status: paused ? "PAUSED" : "ACTIVE",
    },
  });

  await recordAudit({
    action: "UPDATE",
    entity: "Client",
    entityId: clientId,
    summary: paused
      ? `Paused bookings for ${before.clientNo}: ${reason}`
      : `Resumed bookings for ${before.clientNo}`,
    before: auditFields(before, ["isBookingPaused", "bookingPauseReason"]),
    after: { isBookingPaused: paused, bookingPauseReason: paused ? (reason ?? null) : null },
  });

  revalidatePath(`/${locale}/clients/${clientId}`);
  revalidatePath(`/${locale}/clients`);
  return { ok: true };
}

const notesSchema = z.object({
  clientId: z.string().uuid(),
  vipNotes: z.string().trim().max(2000),
  locale: z.string().max(5).default("en"),
});

export async function updateClientNotesAction(raw: unknown): Promise<ActionResult> {
  const parsed = notesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That note is too long." };
  const { clientId, vipNotes, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const exists = await prisma.client.findFirst({
    where: { id: clientId, deletedAt: null },
    select: { id: true, clientNo: true },
  });
  if (!exists) return { ok: false, error: "That client no longer exists." };

  await prisma.client.update({ where: { id: clientId }, data: { vipNotes: vipNotes || null } });

  await recordAudit({
    action: "UPDATE",
    entity: "Client",
    entityId: clientId,
    summary: `Updated notes for ${exists.clientNo}`,
  });

  revalidatePath(`/${locale}/clients/${clientId}`);
  return { ok: true };
}
