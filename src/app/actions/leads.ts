"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { nextDocumentNumber, buildReferralCode } from "@/lib/document-number";
import { LEAD_STATUSES } from "@/lib/queries/leads";

/**
 * The things an operator can do to a lead.
 *
 * Every one of these checks the person's role FIRST. The database's own rules
 * are the second lock, so a bug here still cannot let a cleaner move leads.
 */

const LOST_REASONS = [
  "PRICE_TOO_HIGH", "NO_AVAILABILITY", "WENT_WITH_COMPETITOR",
  "NO_RESPONSE", "OUT_OF_SERVICE_AREA", "NOT_SERIOUS", "OTHER",
] as const;

type ActionResult = { ok: true } | { ok: false; error: string };

const moveSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(LEAD_STATUSES),
  /** Where in the column it was dropped. */
  position: z.number().int().min(0).max(10_000),
  lostReason: z.enum(LOST_REASONS).optional().nullable(),
  lostNote: z.string().trim().max(500).optional().nullable(),
  locale: z.string().max(5).default("en"),
});

export async function moveLeadAction(raw: unknown): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That move was not valid." };
  const { leadId, status, position, lostReason, lostNote, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const before = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true, referenceNo: true, status: true, boardPosition: true, fullName: true },
  });
  if (!before) return { ok: false, error: "That lead no longer exists." };

  // Marking a lead Lost without saying why makes the pipeline report useless,
  // so the reason is required rather than optional.
  if (status === "LOST" && !lostReason) {
    return { ok: false, error: "Please choose a reason before marking a lead as lost." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        status,
        boardPosition: position,
        lostReason: status === "LOST" ? lostReason : null,
        lostNote: status === "LOST" ? (lostNote ?? null) : null,
        firstContactedAt:
          before.status === "NEW" && status !== "NEW" ? new Date() : undefined,
      },
    });

    // Renumber the column so positions stay stable for the next drag.
    const column = await tx.lead.findMany({
      where: { status, deletedAt: null },
      orderBy: [{ boardPosition: "asc" }, { updatedAt: "desc" }],
      select: { id: true },
    });
    await Promise.all(
      column.map((row, index) =>
        tx.lead.update({ where: { id: row.id }, data: { boardPosition: index } }),
      ),
    );

    if (before.status !== status) {
      await tx.leadActivity.create({
        data: {
          leadId,
          type: "STATUS_CHANGE",
          body:
            `Moved from ${before.status} to ${status}` +
            (status === "LOST" && lostReason ? ` — ${lostReason.replace(/_/g, " ").toLowerCase()}` : ""),
        },
      });
    }
  });

  if (before.status !== status) {
    await recordAudit({
      action: "UPDATE",
      entity: "Lead",
      entityId: leadId,
      summary: `Moved lead ${before.referenceNo} (${before.fullName}) from ${before.status} to ${status}`,
      before: { status: before.status },
      after: { status, lostReason: lostReason ?? null },
    });
  }

  revalidatePath(`/${locale}/leads`);
  return { ok: true };
}

const noteSchema = z.object({
  leadId: z.string().uuid(),
  type: z.enum(["NOTE", "CALL", "WHATSAPP", "EMAIL", "SITE_VISIT"]),
  body: z.string().trim().min(1, "Write something first.").max(2000),
  locale: z.string().max(5).default("en"),
});

export async function addLeadNoteAction(raw: unknown): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That note was not valid." };
  }
  const { leadId, type, body, locale } = parsed.data;

  const user = await requireRole(locale, ...OFFICE_ROLES);

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    select: { id: true },
  });
  if (!lead) return { ok: false, error: "That lead no longer exists." };

  await prisma.leadActivity.create({ data: { leadId, type, body, userId: user.id } });
  revalidatePath(`/${locale}/leads`);
  return { ok: true };
}

const convertSchema = z.object({
  leadId: z.string().uuid(),
  locale: z.string().max(5).default("en"),
});

export type ConvertResult =
  | { ok: true; clientId: string; clientNo: string }
  | { ok: false; error: string };

/**
 * Turns a won lead into a real client, carrying across the address, the
 * property details and the source so the CAC report stays accurate.
 */
export async function convertLeadAction(raw: unknown): Promise<ConvertResult> {
  const parsed = convertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "That request was not valid." };
  const { leadId, locale } = parsed.data;

  await requireRole(locale, ...OFFICE_ROLES);

  const lead = await prisma.lead.findFirst({
    where: { id: leadId, deletedAt: null },
    include: { zone: true },
  });
  if (!lead) return { ok: false, error: "That lead no longer exists." };
  if (lead.convertedClientId) {
    return { ok: false, error: "This lead has already been converted to a client." };
  }

  const result = await prisma.$transaction(async (tx) => {
    const clientNo = await nextDocumentNumber(tx, "CL");
    const sequence = Number(clientNo.split("-").pop() ?? "0");

    const client = await tx.client.create({
      data: {
        clientNo,
        type: lead.propertyType === "OFFICE" ? "COMMERCIAL" : "RESIDENTIAL",
        contactName: lead.fullName,
        email: lead.email,
        phone: lead.phone,
        whatsappPhone: lead.phone,
        locale: lead.locale,
        referralCode: buildReferralCode(lead.fullName, sequence),
        leadSource: lead.source,
        acquiredAt: new Date(),
        billingMode: lead.propertyType === "OFFICE" ? "MONTHLY_CONSOLIDATED" : "PER_JOB",
        paymentTermsDays: lead.propertyType === "OFFICE" ? 30 : 7,
        properties: {
          create: {
            label: lead.addressLine ?? `${lead.propertyType ?? "Property"} — ${lead.zone?.nameEn ?? "Dubai"}`,
            propertyType: lead.propertyType ?? "APARTMENT",
            zoneId: lead.zoneId,
            addressLine1: lead.addressLine ?? lead.zone?.nameEn ?? "Dubai",
            city: "Dubai",
            emirate: lead.zone?.emirate ?? "Dubai",
            bedrooms: lead.bedrooms,
            bathrooms: lead.bathrooms,
            sqm: lead.sqm,
            isDefault: true,
          },
        },
      },
    });

    await tx.lead.update({
      where: { id: leadId },
      data: { status: "WON", convertedClientId: client.id, convertedAt: new Date() },
    });

    // A quote raised for the lead now belongs to the client too.
    await tx.quote.updateMany({ where: { leadId }, data: { clientId: client.id } });

    // If they came in through somebody's referral code, record the referral so
    // the reward can be paid and the revenue attributed.
    if (lead.referralCodeUsed) {
      const referrer = await tx.client.findFirst({
        where: { referralCode: lead.referralCodeUsed, deletedAt: null },
        select: { id: true },
      });
      if (referrer && referrer.id !== client.id) {
        const org = await tx.organization.findFirst();
        await tx.referral.create({
          data: {
            code: lead.referralCodeUsed,
            referrerClientId: referrer.id,
            refereeClientId: client.id,
            refereeLeadId: lead.id,
            status: "PENDING",
            referrerRewardFils: org?.referrerRewardValue ?? 0,
            refereeDiscountFils: org?.refereeRewardValue ?? 0,
          },
        });
        await tx.client.update({
          where: { id: client.id },
          data: { referredByClientId: referrer.id, leadSource: "REFERRAL" },
        });
      }
    }

    await tx.leadActivity.create({
      data: { leadId, type: "STATUS_CHANGE", body: `Converted to client ${clientNo}.` },
    });

    return client;
  });

  await recordAudit({
    action: "CREATE",
    entity: "Client",
    entityId: result.id,
    summary: `Converted lead ${lead.referenceNo} into client ${result.clientNo}`,
    after: { clientNo: result.clientNo, fromLead: lead.referenceNo },
  });

  revalidatePath(`/${locale}/leads`);
  revalidatePath(`/${locale}/clients`);
  return { ok: true, clientId: result.id, clientNo: result.clientNo };
}
