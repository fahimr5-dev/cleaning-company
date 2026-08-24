import "server-only";
import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { priceService, totalsFor, type RateCardRule } from "@/lib/pricing";

/**
 * Works out what a job costs, using the rate card stored in the database.
 *
 * PLAIN ENGLISH: not one price in this file is written into the code. Every
 * figure is read from the rate card you control in Settings, so changing a price
 * there changes the website calculator, the admin booking screen and the quote
 * PDF at the same moment.
 */

export const PROPERTY_TYPES = ["APARTMENT", "VILLA", "OFFICE"] as const;
export const FREQUENCIES = ["ONE_OFF", "WEEKLY", "BI_WEEKLY", "MONTHLY"] as const;

export const quoteInputSchema = z.object({
  propertyType: z.enum(PROPERTY_TYPES),
  serviceCode: z.string().min(1).max(40),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  bathrooms: z.coerce.number().int().min(0).max(20).optional(),
  sqm: z.coerce.number().int().min(10).max(20000).optional(),
  frequency: z.enum(FREQUENCIES),
  addOns: z
    .array(
      z.object({
        code: z.string().min(1).max(40),
        units: z.coerce.number().int().min(1).max(200),
      }),
    )
    .max(5)
    .optional(),
  referralCode: z.string().trim().max(32).optional().nullable(),
});

export type QuoteInput = z.infer<typeof quoteInputSchema>;

export type QuoteLineResult = {
  serviceCode: string;
  nameEn: string;
  nameAr: string;
  quantity: number;
  unitPriceFils: number;
  lineTotalFils: number;
  /** True when the minimum call-out charge applied instead of the calculated price. */
  minimumApplied: boolean;
};

export type QuoteResult = {
  lines: QuoteLineResult[];
  durationMinutes: number;
  cleanersRequired: number;
  subtotalFils: number;
  frequencyDiscountBps: number;
  frequencyDiscountFils: number;
  referralDiscountFils: number;
  discountFils: number;
  netFils: number;
  vatRateBps: number;
  vatFils: number;
  totalFils: number;
  currency: string;
  referral: { code: string; referrerName: string } | null;
};

export class QuoteError extends Error {}

/**
 * The whole rate card, loaded once per request.
 *
 * `cache` means six components on one page share a single database read.
 */
export const getQuoteCatalog = cache(async () => {
  const [org, rateCard, services] = await Promise.all([
    prisma.organization.findFirst(),
    prisma.rateCard.findFirst({
      where: { isActive: true, deletedAt: null },
      include: {
        items: { where: { isActive: true } },
        frequencyModifiers: true,
      },
    }),
    prisma.serviceType.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!org) {
    throw new QuoteError(
      "No company settings found. Run `npm run db:seed` to create them.",
    );
  }
  if (!rateCard) {
    throw new QuoteError(
      "No active rate card found. Activate one in Settings, or run `npm run db:seed`.",
    );
  }

  const serviceById = new Map(services.map((s) => [s.id, s]));

  // Which property types each service actually has a price for — this is what
  // stops the website offering a villa deep clean we have no rate for.
  const availability = new Map<string, Set<string>>();
  for (const item of rateCard.items) {
    const service = serviceById.get(item.serviceTypeId);
    if (!service) continue;
    if (!availability.has(service.code)) availability.set(service.code, new Set());
    availability.get(service.code)!.add(item.propertyType);
  }

  const ruleFor = (serviceCode: string, propertyType: string): RateCardRule | null => {
    const service = services.find((s) => s.code === serviceCode);
    if (!service) return null;
    const item = rateCard.items.find(
      (i) => i.serviceTypeId === service.id && i.propertyType === propertyType,
    );
    return (item as RateCardRule | undefined) ?? null;
  };

  const frequencyDiscountBps = (frequency: string): number =>
    rateCard.frequencyModifiers.find((m) => m.frequency === frequency)?.discountBps ?? 0;

  return {
    org,
    rateCard,
    services,
    coreServices: services.filter((s) => s.category === "CORE"),
    addOnServices: services.filter((s) => s.category === "ADDON"),
    availability,
    ruleFor,
    frequencyDiscountBps,
    serviceByCode: new Map(services.map((s) => [s.code, s])),
  };
});

/** A referral code is only worth a discount if it belongs to a real, active client. */
async function lookupReferral(code: string | null | undefined) {
  const trimmed = code?.trim().toUpperCase();
  if (!trimmed) return null;

  const referrer = await prisma.client.findFirst({
    where: { referralCode: trimmed, deletedAt: null, status: "ACTIVE" },
    select: { id: true, contactName: true, companyName: true, referralCode: true },
  });
  if (!referrer) return null;

  return {
    id: referrer.id,
    code: referrer.referralCode,
    referrerName: referrer.companyName ?? referrer.contactName,
  };
}

/**
 * Prices a quote. Throws QuoteError with a readable message if the rate card
 * has no price for what was asked for — never silently returns zero.
 */
export async function priceQuote(input: QuoteInput): Promise<QuoteResult> {
  const catalog = await getQuoteCatalog();
  const { org } = catalog;

  const mainService = catalog.serviceByCode.get(input.serviceCode);
  if (!mainService) {
    throw new QuoteError(`Unknown service "${input.serviceCode}".`);
  }

  const mainRule = catalog.ruleFor(input.serviceCode, input.propertyType);
  if (!mainRule) {
    throw new QuoteError(
      `The rate card has no price for ${mainService.nameEn} in a ${input.propertyType.toLowerCase()}.`,
    );
  }

  const sizing = {
    bedrooms: input.bedrooms ?? 0,
    bathrooms: input.bathrooms ?? 0,
    sqm: input.sqm ?? 0,
  };

  const mainPriced = priceService(mainRule, sizing);
  const lines: QuoteLineResult[] = [
    {
      serviceCode: mainService.code,
      nameEn: mainService.nameEn,
      nameAr: mainService.nameAr,
      quantity: 1,
      unitPriceFils: mainPriced.netFils,
      lineTotalFils: mainPriced.netFils,
      minimumApplied: mainPriced.minimumApplied,
    },
  ];

  let durationMinutes = mainPriced.minutes;
  let cleanersRequired = mainService.defaultCleaners;

  for (const addOn of input.addOns ?? []) {
    const service = catalog.serviceByCode.get(addOn.code);
    if (!service) throw new QuoteError(`Unknown add-on "${addOn.code}".`);

    const rule = catalog.ruleFor(addOn.code, input.propertyType);
    if (!rule) {
      throw new QuoteError(
        `The rate card has no price for ${service.nameEn} in a ${input.propertyType.toLowerCase()}.`,
      );
    }

    const priced = priceService(rule, { ...sizing, units: addOn.units });
    lines.push({
      serviceCode: service.code,
      nameEn: service.nameEn,
      nameAr: service.nameAr,
      quantity: addOn.units,
      unitPriceFils: Math.round(priced.netFils / addOn.units),
      lineTotalFils: priced.netFils,
      minimumApplied: priced.minimumApplied,
    });
    durationMinutes += priced.minutes;
    cleanersRequired = Math.max(cleanersRequired, service.defaultCleaners);
  }

  // A referral discount is a flat amount off, or a percentage, depending on the
  // setting in the organisation record.
  const referral = await lookupReferral(input.referralCode);
  const frequencyDiscountBps = catalog.frequencyDiscountBps(input.frequency);
  const subtotalBeforeDiscounts = lines.reduce((sum, l) => sum + l.lineTotalFils, 0);

  let referralDiscountFils = 0;
  if (referral) {
    referralDiscountFils =
      org.referralDiscountType === "PERCENTAGE"
        ? Math.round((subtotalBeforeDiscounts * org.refereeRewardValue) / 10000)
        : org.refereeRewardValue;
  }

  const totals = totalsFor(
    lines.map((l) => l.lineTotalFils),
    frequencyDiscountBps,
    org.vatRateBps,
    referralDiscountFils,
  );

  return {
    lines,
    durationMinutes,
    cleanersRequired,
    subtotalFils: totals.subtotalFils,
    frequencyDiscountBps,
    frequencyDiscountFils: totals.discountFils - Math.min(referralDiscountFils, totals.discountFils),
    referralDiscountFils: Math.min(referralDiscountFils, totals.discountFils),
    discountFils: totals.discountFils,
    netFils: totals.netFils,
    vatRateBps: org.vatRateBps,
    vatFils: totals.vatFils,
    totalFils: totals.totalFils,
    currency: org.currency,
    referral: referral ? { code: referral.code, referrerName: referral.referrerName } : null,
  };
}
