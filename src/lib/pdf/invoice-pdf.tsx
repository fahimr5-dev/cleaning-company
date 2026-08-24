import path from "node:path";
import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Font, renderToBuffer,
} from "@react-pdf/renderer";
import { formatMoney } from "@/lib/money";

/**
 * The VAT invoice PDF.
 *
 * PLAIN ENGLISH: this is the document the UAE Federal Tax Authority expects a
 * VAT-registered business to issue. Getting it wrong is a fineable offence, so
 * every element the FTA lists is here and labelled:
 *
 *   - the words "Tax Invoice" prominently
 *   - your name, address and Tax Registration Number
 *   - the customer's name, address and TRN where they have one
 *   - a sequential invoice number that never repeats
 *   - the date of issue, and the date of supply
 *   - a description of each supply, its unit price and quantity
 *   - the amount payable excluding tax, the tax charged, and the gross
 *   - the rate of tax on each line
 *   - everything in AED
 *
 * TODO (before you go live): have your accountant look at one of these against
 * your trade licence. The layout is right; only your accountant can confirm the
 * wording suits your particular licence and activity.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");

let registered = false;
function registerFonts() {
  if (registered) return;
  Font.register({ family: "Body", fonts: [{ src: path.join(FONT_DIR, "Inter-Regular.ttf") }] });
  Font.register({
    family: "Arabic",
    fonts: [
      { src: path.join(FONT_DIR, "IBMPlexSansArabic-Regular.ttf") },
      { src: path.join(FONT_DIR, "IBMPlexSansArabic-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

export type InvoicePdfLine = {
  description: string;
  quantity: number;
  unitPriceFils: number;
  discountFils: number;
  vatRateBps: number;
  vatFils: number;
  netFils: number;
};

export type InvoicePdfData = {
  invoiceNo: string;
  issueDate: Date;
  dueDate: Date;
  /** When the work was actually done — the FTA calls this the date of supply. */
  supplyDate: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  locale: "en" | "ar";
  isCreditNote?: boolean;
  supplier: {
    name: string;
    nameAr: string | null;
    trn: string | null;
    addressLines: string[];
    phone: string | null;
    email: string | null;
  };
  buyer: {
    name: string;
    trn: string | null;
    addressLines: string[];
    phone: string | null;
    email: string | null;
  };
  lines: InvoicePdfLine[];
  subtotalFils: number;
  discountFils: number;
  vatFils: number;
  totalFils: number;
  amountPaidFils: number;
  balanceFils: number;
  vatByRate: { rateBps: number; netFils: number; vatFils: number }[];
  notes: string | null;
  bank: { name: string | null; accountName: string | null; iban: string | null } | null;
  payUrl: string | null;
};

const T = {
  en: {
    taxInvoice: "TAX INVOICE", creditNote: "TAX CREDIT NOTE",
    invoiceNo: "Invoice no.", creditNoteNo: "Credit note no.",
    issueDate: "Date of issue", supplyDate: "Date of supply", dueDate: "Payment due",
    period: "Period",
    supplier: "Supplied by", buyer: "Billed to", trn: "TRN",
    description: "Description", qty: "Qty", unitPrice: "Unit price",
    vatRate: "VAT %", vatAmount: "VAT", netAmount: "Amount (excl. VAT)",
    subtotal: "Subtotal (excl. VAT)", discount: "Discount",
    totalExcl: "Total excluding VAT", totalVat: "Total VAT",
    totalIncl: "Total including VAT", paid: "Paid", balance: "Balance due",
    vatSummary: "VAT summary", rate: "Rate", net: "Net", vat: "VAT",
    payOnline: "Pay by card", bankTransfer: "Bank transfer",
    iban: "IBAN", accountName: "Account name", bankName: "Bank",
    notes: "Notes",
    footer: "All amounts are in UAE Dirhams (AED). This is a tax invoice issued under UAE VAT law.",
    creditFooter: "All amounts are in UAE Dirhams (AED). This credit note refers to the invoice named above.",
  },
  ar: {
    taxInvoice: "فاتورة ضريبية", creditNote: "إشعار دائن ضريبي",
    invoiceNo: "رقم الفاتورة", creditNoteNo: "رقم الإشعار",
    issueDate: "تاريخ الإصدار", supplyDate: "تاريخ التوريد", dueDate: "تاريخ الاستحقاق",
    period: "الفترة",
    supplier: "المورّد", buyer: "العميل", trn: "الرقم الضريبي",
    description: "الوصف", qty: "الكمية", unitPrice: "سعر الوحدة",
    vatRate: "نسبة الضريبة", vatAmount: "الضريبة", netAmount: "المبلغ قبل الضريبة",
    subtotal: "المجموع قبل الضريبة", discount: "الخصم",
    totalExcl: "الإجمالي قبل الضريبة", totalVat: "إجمالي الضريبة",
    totalIncl: "الإجمالي شامل الضريبة", paid: "المدفوع", balance: "المبلغ المستحق",
    vatSummary: "ملخص الضريبة", rate: "النسبة", net: "الصافي", vat: "الضريبة",
    payOnline: "الدفع بالبطاقة", bankTransfer: "التحويل البنكي",
    iban: "الآيبان", accountName: "اسم الحساب", bankName: "البنك",
    notes: "ملاحظات",
    footer: "جميع المبالغ بالدرهم الإماراتي. هذه فاتورة ضريبية صادرة وفق قانون ضريبة القيمة المضافة في الإمارات.",
    creditFooter: "جميع المبالغ بالدرهم الإماراتي. يشير هذا الإشعار إلى الفاتورة المذكورة أعلاه.",
  },
} as const;

function styles(rtl: boolean) {
  const align = rtl ? "right" : "left";
  const numAlign = rtl ? "left" : "right";
  return StyleSheet.create({
    page: {
      fontFamily: rtl ? "Arabic" : "Body",
      fontSize: 9,
      paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36,
      color: "#111827", direction: rtl ? "rtl" : "ltr", textAlign: align,
    },
    header: { flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", marginBottom: 20 },
    title: { fontSize: 17, fontWeight: 700 },
    companyName: { fontSize: 13, fontWeight: 700, marginBottom: 3 },
    muted: { color: "#6B7280", fontSize: 8, lineHeight: 1.5 },
    metaBlock: { textAlign: numAlign },
    parties: { flexDirection: rtl ? "row-reverse" : "row", gap: 28, marginBottom: 18 },
    party: { flex: 1 },
    label: { fontSize: 7, color: "#6B7280", marginBottom: 3, letterSpacing: rtl ? 0 : 0.6 },
    trnBox: {
      marginTop: 4, paddingVertical: 2, paddingHorizontal: 5,
      backgroundColor: "#F3F4F6", borderRadius: 2, fontSize: 8,
    },
    tableHead: {
      flexDirection: rtl ? "row-reverse" : "row",
      borderBottomWidth: 1, borderBottomColor: "#111827",
      paddingBottom: 4, marginBottom: 3,
    },
    row: {
      flexDirection: rtl ? "row-reverse" : "row",
      borderBottomWidth: 1, borderBottomColor: "#F3F4F6", paddingVertical: 5,
    },
    colDesc: { flex: 4, textAlign: align },
    colQty: { flex: 0.8, textAlign: numAlign },
    colNum: { flex: 1.4, textAlign: numAlign },
    colRate: { flex: 0.9, textAlign: numAlign },
    lower: { flexDirection: rtl ? "row-reverse" : "row", gap: 24, marginTop: 16 },
    totalsRow: {
      flexDirection: rtl ? "row-reverse" : "row",
      justifyContent: "space-between", paddingVertical: 2.5,
    },
    grand: {
      borderTopWidth: 1, borderTopColor: "#111827",
      marginTop: 4, paddingTop: 5, fontWeight: 700, fontSize: 11,
    },
    balance: {
      marginTop: 6, paddingVertical: 5, paddingHorizontal: 7,
      backgroundColor: "#FEF3C7", borderRadius: 3, fontWeight: 700, fontSize: 11,
    },
    footer: {
      position: "absolute", bottom: 26, left: 36, right: 36,
      fontSize: 7, color: "#6B7280", textAlign: "center",
    },
  });
}

export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  registerFonts();
  const rtl = data.locale === "ar";
  const t = T[data.locale];
  const s = styles(rtl);

  const money = (fils: number) => formatMoney(fils, data.locale);
  const date = (d: Date) =>
    new Intl.DateTimeFormat(rtl ? "ar-AE" : "en-AE", {
      day: "numeric", month: "short", year: "numeric",
    }).format(d);

  const supplierName = rtl ? (data.supplier.nameAr ?? data.supplier.name) : data.supplier.name;
  const title = data.isCreditNote ? t.creditNote : t.taxInvoice;
  const numberLabel = data.isCreditNote ? t.creditNoteNo : t.invoiceNo;

  return renderToBuffer(
    <Document title={`${title} ${data.invoiceNo}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.companyName}>{supplierName}</Text>
            {data.supplier.addressLines.map((line, i) => (
              <Text key={i} style={s.muted}>{line}</Text>
            ))}
            {data.supplier.phone ? <Text style={s.muted}>{data.supplier.phone}</Text> : null}
            {data.supplier.email ? <Text style={s.muted}>{data.supplier.email}</Text> : null}
          </View>

          <View style={s.metaBlock}>
            {/* The FTA requires these words to be prominent. */}
            <Text style={s.title}>{title}</Text>
            <Text style={s.muted}>{numberLabel}: {data.invoiceNo}</Text>
            <Text style={s.muted}>{t.issueDate}: {date(data.issueDate)}</Text>
            {data.supplyDate ? (
              <Text style={s.muted}>{t.supplyDate}: {date(data.supplyDate)}</Text>
            ) : null}
            {data.periodStart && data.periodEnd ? (
              <Text style={s.muted}>
                {t.period}: {date(data.periodStart)} – {date(data.periodEnd)}
              </Text>
            ) : null}
            {!data.isCreditNote ? (
              <Text style={s.muted}>{t.dueDate}: {date(data.dueDate)}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.parties}>
          <View style={s.party}>
            <Text style={s.label}>{t.supplier}</Text>
            <Text>{supplierName}</Text>
            {data.supplier.addressLines.map((line, i) => (
              <Text key={i} style={s.muted}>{line}</Text>
            ))}
            {data.supplier.trn ? (
              <Text style={s.trnBox}>{t.trn}: {data.supplier.trn}</Text>
            ) : null}
          </View>

          <View style={s.party}>
            <Text style={s.label}>{t.buyer}</Text>
            <Text>{data.buyer.name}</Text>
            {data.buyer.addressLines.map((line, i) => (
              <Text key={i} style={s.muted}>{line}</Text>
            ))}
            {data.buyer.phone ? <Text style={s.muted}>{data.buyer.phone}</Text> : null}
            {/* Only shown when the customer is VAT registered. */}
            {data.buyer.trn ? <Text style={s.trnBox}>{t.trn}: {data.buyer.trn}</Text> : null}
          </View>
        </View>

        <View>
          <View style={s.tableHead}>
            <Text style={s.colDesc}>{t.description}</Text>
            <Text style={s.colQty}>{t.qty}</Text>
            <Text style={s.colNum}>{t.unitPrice}</Text>
            <Text style={s.colNum}>{t.netAmount}</Text>
            <Text style={s.colRate}>{t.vatRate}</Text>
            <Text style={s.colNum}>{t.vatAmount}</Text>
          </View>

          {data.lines.map((line, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={s.colDesc}>{line.description}</Text>
              <Text style={s.colQty}>{line.quantity}</Text>
              <Text style={s.colNum}>{money(line.unitPriceFils)}</Text>
              <Text style={s.colNum}>{money(line.netFils)}</Text>
              <Text style={s.colRate}>{line.vatRateBps / 100}%</Text>
              <Text style={s.colNum}>{money(line.vatFils)}</Text>
            </View>
          ))}
        </View>

        <View style={s.lower}>
          {/* Left: how to pay, and the VAT breakdown a return needs. */}
          <View style={{ flex: 1 }}>
            {data.vatByRate.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Text style={s.label}>{t.vatSummary}</Text>
                <View style={{ flexDirection: rtl ? "row-reverse" : "row", marginTop: 2 }}>
                  <Text style={[s.muted, { flex: 1 }]}>{t.rate}</Text>
                  <Text style={[s.muted, { flex: 1.4, textAlign: rtl ? "left" : "right" }]}>{t.net}</Text>
                  <Text style={[s.muted, { flex: 1.4, textAlign: rtl ? "left" : "right" }]}>{t.vat}</Text>
                </View>
                {data.vatByRate.map((r) => (
                  <View key={r.rateBps} style={{ flexDirection: rtl ? "row-reverse" : "row" }}>
                    <Text style={{ flex: 1 }}>{r.rateBps / 100}%</Text>
                    <Text style={{ flex: 1.4, textAlign: rtl ? "left" : "right" }}>{money(r.netFils)}</Text>
                    <Text style={{ flex: 1.4, textAlign: rtl ? "left" : "right" }}>{money(r.vatFils)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {data.bank?.iban && !data.isCreditNote ? (
              <View style={{ marginBottom: 10 }}>
                <Text style={s.label}>{t.bankTransfer}</Text>
                {data.bank.name ? <Text style={s.muted}>{t.bankName}: {data.bank.name}</Text> : null}
                {data.bank.accountName ? (
                  <Text style={s.muted}>{t.accountName}: {data.bank.accountName}</Text>
                ) : null}
                <Text style={s.muted}>{t.iban}: {data.bank.iban}</Text>
              </View>
            ) : null}

            {data.payUrl && !data.isCreditNote ? (
              <View>
                <Text style={s.label}>{t.payOnline}</Text>
                <Text style={[s.muted, { color: "#2563EB" }]}>{data.payUrl}</Text>
              </View>
            ) : null}

            {data.notes ? (
              <View style={{ marginTop: 10 }}>
                <Text style={s.label}>{t.notes}</Text>
                <Text style={s.muted}>{data.notes}</Text>
              </View>
            ) : null}
          </View>

          {/* Right: the totals. */}
          <View style={{ width: 210 }}>
            <View style={s.totalsRow}>
              <Text style={s.muted}>{t.subtotal}</Text>
              <Text>{money(data.subtotalFils)}</Text>
            </View>
            {data.discountFils > 0 ? (
              <View style={s.totalsRow}>
                <Text style={s.muted}>{t.discount}</Text>
                <Text>-{money(data.discountFils)}</Text>
              </View>
            ) : null}
            <View style={s.totalsRow}>
              <Text style={s.muted}>{t.totalExcl}</Text>
              <Text>{money(data.subtotalFils - data.discountFils)}</Text>
            </View>
            <View style={s.totalsRow}>
              <Text style={s.muted}>{t.totalVat}</Text>
              <Text>{money(data.vatFils)}</Text>
            </View>
            <View style={[s.totalsRow, s.grand]}>
              <Text>{t.totalIncl}</Text>
              <Text>{money(data.totalFils)}</Text>
            </View>

            {!data.isCreditNote && data.amountPaidFils > 0 ? (
              <View style={s.totalsRow}>
                <Text style={s.muted}>{t.paid}</Text>
                <Text>-{money(data.amountPaidFils)}</Text>
              </View>
            ) : null}

            {!data.isCreditNote && data.balanceFils > 0 ? (
              <View style={[s.totalsRow, s.balance]}>
                <Text>{t.balance}</Text>
                <Text>{money(data.balanceFils)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={s.footer} fixed>
          {data.isCreditNote ? t.creditFooter : t.footer}
        </Text>
      </Page>
    </Document>,
  );
}
