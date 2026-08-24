import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";

/**
 * Serves the quote PDF.
 *
 * The PDF is generated fresh each time rather than stored, so it always matches
 * the quote in the database. The quote's random id in the address is what
 * authorises the download — see the note on the customer quote page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const localeParam = request.nextUrl.searchParams.get("locale");
  const locale: "en" | "ar" = localeParam === "ar" ? "ar" : "en";

  const [quote, org] = await Promise.all([
    prisma.quote.findFirst({
      where: { id, deletedAt: null },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        lead: { select: { fullName: true, phone: true, email: true, addressLine: true } },
        client: {
          select: { contactName: true, companyName: true, phone: true, email: true },
        },
      },
    }),
    prisma.organization.findFirst(),
  ]);

  if (!quote || !org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const frequencyLabels: Record<string, { en: string; ar: string }> = {
    ONE_OFF: { en: "One-off", ar: "مرة واحدة" },
    WEEKLY: { en: "Weekly", ar: "أسبوعي" },
    BI_WEEKLY: { en: "Every two weeks", ar: "كل أسبوعين" },
    MONTHLY: { en: "Monthly", ar: "شهري" },
  };

  const pdf = await renderQuotePdf({
    quoteNo: quote.quoteNo,
    issuedAt: quote.createdAt,
    validUntil: quote.validUntil,
    locale,
    company: {
      name: org.name,
      nameAr: org.nameAr,
      trn: org.trn,
      addressLines: [org.addressLine1, org.addressLine2, org.city].filter(Boolean) as string[],
      phone: org.phone,
      email: org.email,
      website: org.website,
    },
    customer: {
      name: quote.client?.companyName ?? quote.client?.contactName ?? quote.lead?.fullName ?? "",
      phone: quote.client?.phone ?? quote.lead?.phone ?? "",
      email: quote.client?.email ?? quote.lead?.email ?? null,
      address: quote.lead?.addressLine ?? null,
    },
    lines: quote.lines.map((l) => ({
      description: (locale === "ar" ? l.descriptionAr : l.descriptionEn) ?? l.descriptionEn,
      quantity: Number(l.quantity),
      unitPriceFils: l.unitPriceFils,
      lineTotalFils: l.lineTotalFils,
    })),
    subtotalFils: quote.subtotalFils,
    discountFils: quote.discountFils,
    vatRateBps: quote.vatRateBps,
    vatFils: quote.vatFils,
    totalFils: quote.totalFils,
    frequencyLabel: frequencyLabels[quote.frequency]?.[locale] ?? quote.frequency,
    notes: (locale === "ar" ? quote.notesAr : quote.notesEn) ?? null,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNo}.pdf"`,
      // A quote is personal: never let a proxy or CDN keep a copy.
      "Cache-Control": "private, no-store",
    },
  });
}
