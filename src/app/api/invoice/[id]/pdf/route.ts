import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { renderInvoicePdf } from "@/lib/pdf/invoice-pdf";

/**
 * The invoice PDF.
 *
 * WHO MAY DOWNLOAD ONE: the owner, an operations manager (read-only), or the
 * client the invoice belongs to. Anybody else gets a 404 — not a 403, because
 * "that invoice exists but is not yours" is itself information.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const localeParam = request.nextUrl.searchParams.get("locale");
  const locale: "en" | "ar" = localeParam === "ar" ? "ar" : "en";

  const invoice = await prisma.invoice.findFirst({
    where: { id, deletedAt: null },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      client: { select: { id: true, contactName: true, companyName: true, phone: true, email: true } },
      jobs: { select: { actualEnd: true, scheduledStart: true }, orderBy: { scheduledStart: "asc" }, take: 1 },
    },
  });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed =
    user.role === "OWNER" ||
    user.role === "OPS_MANAGER" ||
    (user.role === "CLIENT" && user.clientId === invoice.clientId);
  if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const org = await prisma.organization.findFirst();
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Group VAT by rate for the summary block the FTA expects.
  const byRate = new Map<number, { netFils: number; vatFils: number }>();
  for (const line of invoice.lines) {
    const current = byRate.get(line.vatRateBps) ?? { netFils: 0, vatFils: 0 };
    byRate.set(line.vatRateBps, {
      netFils: current.netFils + line.lineTotalFils,
      vatFils: current.vatFils + line.vatFils,
    });
  }

  const pdf = await renderInvoicePdf({
    invoiceNo: invoice.invoiceNo,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    supplyDate: invoice.jobs[0]?.actualEnd ?? invoice.jobs[0]?.scheduledStart ?? null,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    locale,
    supplier: {
      // Prefer the details frozen onto the invoice; fall back to today's
      // settings only for an invoice raised before we started freezing them.
      name: invoice.supplierName ?? org.name,
      nameAr: org.nameAr,
      trn: invoice.supplierTrn ?? org.trn,
      addressLines: (invoice.supplierAddress ??
        [org.addressLine1, org.addressLine2, org.city].filter(Boolean).join(", "))
        .split(", ").filter(Boolean),
      phone: org.phone,
      email: org.email,
    },
    buyer: {
      name: invoice.buyerName ?? invoice.client.companyName ?? invoice.client.contactName,
      trn: invoice.buyerTrn,
      addressLines: (invoice.buyerAddress ?? "").split(", ").filter(Boolean),
      phone: invoice.client.phone,
      email: invoice.client.email,
    },
    lines: invoice.lines.map((line) => ({
      description: (locale === "ar" ? line.descriptionAr : line.descriptionEn) ?? line.descriptionEn,
      quantity: Number(line.quantity),
      unitPriceFils: line.unitPriceFils,
      discountFils: line.discountFils,
      vatRateBps: line.vatRateBps,
      vatFils: line.vatFils,
      netFils: line.lineTotalFils,
    })),
    subtotalFils: invoice.subtotalFils,
    discountFils: invoice.discountFils,
    vatFils: invoice.vatFils,
    totalFils: invoice.totalFils,
    amountPaidFils: invoice.amountPaidFils,
    balanceFils: invoice.balanceFils,
    vatByRate: [...byRate.entries()].map(([rateBps, v]) => ({ rateBps, ...v })),
    notes: (locale === "ar" ? invoice.notesAr : invoice.notesEn) ??
      (locale === "ar" ? org.invoiceFooterAr : org.invoiceFooterEn),
    bank: { name: org.bankName, accountName: org.bankAccountName, iban: org.bankIban },
    payUrl: invoice.stripePaymentLinkUrl,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoiceNo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
