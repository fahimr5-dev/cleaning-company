import path from "node:path";
import React from "react";
import {
  Document, Page, Text, View, StyleSheet, Font, renderToBuffer,
} from "@react-pdf/renderer";
import { formatMoney } from "@/lib/money";

/**
 * Builds the quote PDF that gets emailed to a customer.
 *
 * PLAIN ENGLISH: a proper document with your company details, a line-by-line
 * price, the 5% VAT shown separately and an expiry date — the thing a customer
 * forwards to their spouse or their finance department.
 *
 * Each PDF is produced in ONE language. Mixing Arabic and English on the same
 * line reorders unpredictably in PDF, so the Arabic quote is fully Arabic and
 * the English quote fully English.
 */

const FONT_DIR = path.join(process.cwd(), "src/lib/pdf/fonts");

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: "Body",
    fonts: [{ src: path.join(FONT_DIR, "Inter-Regular.ttf") }],
  });
  // IBM Plex Sans Arabic, deliberately. It is the same face the website uses,
  // and — unlike the Naskh faces we tried first — its letter dots stay attached
  // to their letters when this PDF library lays Arabic out. A quote with
  // floating dots looks broken to anybody who reads Arabic.
  Font.register({
    family: "Arabic",
    fonts: [
      { src: path.join(FONT_DIR, "IBMPlexSansArabic-Regular.ttf") },
      { src: path.join(FONT_DIR, "IBMPlexSansArabic-Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Stops react-pdf hyphenating words in the middle, which looks wrong in both
  // languages and is actively broken for Arabic.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

export type QuotePdfData = {
  quoteNo: string;
  issuedAt: Date;
  validUntil: Date;
  locale: "en" | "ar";
  company: {
    name: string;
    nameAr: string | null;
    trn: string | null;
    addressLines: string[];
    phone: string | null;
    email: string | null;
    website: string | null;
  };
  customer: { name: string; phone: string; email: string | null; address: string | null };
  lines: { description: string; quantity: number; unitPriceFils: number; lineTotalFils: number }[];
  subtotalFils: number;
  discountFils: number;
  vatRateBps: number;
  vatFils: number;
  totalFils: number;
  frequencyLabel: string;
  notes: string | null;
};

const T = {
  en: {
    quote: "QUOTATION", quoteNo: "Quote no.", date: "Date", validUntil: "Valid until",
    billTo: "Prepared for", description: "Description", qty: "Qty", unit: "Unit price",
    amount: "Amount", subtotal: "Subtotal", discount: "Discount", vat: "VAT",
    total: "Total", trn: "TRN", frequency: "Service frequency", notes: "Notes",
    footer: "Prices are in AED and exclude nothing beyond what is listed above. VAT is charged at the rate shown.",
  },
  ar: {
    quote: "عرض سعر", quoteNo: "رقم العرض", date: "التاريخ", validUntil: "صالح حتى",
    billTo: "مقدم إلى", description: "الوصف", qty: "الكمية", unit: "سعر الوحدة",
    amount: "المبلغ", subtotal: "المجموع الفرعي", discount: "الخصم", vat: "ضريبة القيمة المضافة",
    total: "الإجمالي", trn: "الرقم الضريبي", frequency: "تكرار الخدمة", notes: "ملاحظات",
    footer: "الأسعار بالدرهم الإماراتي. تُحتسب ضريبة القيمة المضافة بالنسبة الموضحة.",
  },
} as const;

function styles(rtl: boolean) {
  const align = rtl ? "right" : "left";
  return StyleSheet.create({
    page: {
      fontFamily: rtl ? "Arabic" : "Body",
      fontSize: 10,
      paddingTop: 40, paddingBottom: 50, paddingHorizontal: 40,
      color: "#111827",
      direction: rtl ? "rtl" : "ltr",
      textAlign: align,
    },
    header: { flexDirection: rtl ? "row-reverse" : "row", justifyContent: "space-between", marginBottom: 24 },
    companyName: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
    muted: { color: "#6B7280", fontSize: 9, lineHeight: 1.5 },
    title: { fontSize: 20, fontWeight: 700, letterSpacing: rtl ? 0 : 1 },
    metaBlock: { textAlign: rtl ? "left" : "right" },
    section: { marginBottom: 18 },
    label: { fontSize: 8, color: "#6B7280", textTransform: rtl ? "none" : "uppercase", marginBottom: 3 },
    tableHead: {
      flexDirection: rtl ? "row-reverse" : "row",
      borderBottomWidth: 1, borderBottomColor: "#111827",
      paddingBottom: 5, marginBottom: 5,
    },
    row: {
      flexDirection: rtl ? "row-reverse" : "row",
      borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
      paddingVertical: 6,
    },
    colDesc: { flex: 4, textAlign: align },
    colNum: { flex: 1, textAlign: rtl ? "left" : "right" },
    totals: { marginTop: 14, alignItems: rtl ? "flex-start" : "flex-end" },
    totalsRow: { flexDirection: rtl ? "row-reverse" : "row", width: 230, justifyContent: "space-between", paddingVertical: 3 },
    grand: { borderTopWidth: 1, borderTopColor: "#111827", marginTop: 5, paddingTop: 6, fontWeight: 700, fontSize: 12 },
    footer: {
      position: "absolute", bottom: 26, left: 40, right: 40,
      fontSize: 8, color: "#6B7280", textAlign: "center",
    },
  });
}

export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  registerFonts();
  const rtl = data.locale === "ar";
  const t = T[data.locale];
  const s = styles(rtl);
  const money = (fils: number) => formatMoney(fils, data.locale);
  const date = (d: Date) =>
    new Intl.DateTimeFormat(rtl ? "ar-AE" : "en-AE", { day: "numeric", month: "short", year: "numeric" }).format(d);

  const companyName = rtl ? (data.company.nameAr ?? data.company.name) : data.company.name;

  const doc = (
    <Document title={`${t.quote} ${data.quoteNo}`}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View>
            <Text style={s.companyName}>{companyName}</Text>
            {data.company.addressLines.map((line, i) => (
              <Text key={i} style={s.muted}>{line}</Text>
            ))}
            {data.company.phone ? <Text style={s.muted}>{data.company.phone}</Text> : null}
            {data.company.email ? <Text style={s.muted}>{data.company.email}</Text> : null}
            {data.company.trn ? <Text style={s.muted}>{t.trn}: {data.company.trn}</Text> : null}
          </View>
          <View style={s.metaBlock}>
            <Text style={s.title}>{t.quote}</Text>
            <Text style={s.muted}>{t.quoteNo}: {data.quoteNo}</Text>
            <Text style={s.muted}>{t.date}: {date(data.issuedAt)}</Text>
            <Text style={s.muted}>{t.validUntil}: {date(data.validUntil)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>{t.billTo}</Text>
          <Text>{data.customer.name}</Text>
          {data.customer.address ? <Text style={s.muted}>{data.customer.address}</Text> : null}
          <Text style={s.muted}>{data.customer.phone}</Text>
          {data.customer.email ? <Text style={s.muted}>{data.customer.email}</Text> : null}
        </View>

        <View style={s.section}>
          <Text style={s.label}>{t.frequency}</Text>
          <Text>{data.frequencyLabel}</Text>
        </View>

        <View>
          <View style={s.tableHead}>
            <Text style={s.colDesc}>{t.description}</Text>
            <Text style={s.colNum}>{t.qty}</Text>
            <Text style={s.colNum}>{t.unit}</Text>
            <Text style={s.colNum}>{t.amount}</Text>
          </View>
          {data.lines.map((line, i) => (
            <View key={i} style={s.row}>
              <Text style={s.colDesc}>{line.description}</Text>
              <Text style={s.colNum}>{line.quantity}</Text>
              <Text style={s.colNum}>{money(line.unitPriceFils)}</Text>
              <Text style={s.colNum}>{money(line.lineTotalFils)}</Text>
            </View>
          ))}
        </View>

        <View style={s.totals}>
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
            <Text style={s.muted}>{t.vat} ({data.vatRateBps / 100}%)</Text>
            <Text>{money(data.vatFils)}</Text>
          </View>
          <View style={[s.totalsRow, s.grand]}>
            <Text>{t.total}</Text>
            <Text>{money(data.totalFils)}</Text>
          </View>
        </View>

        {data.notes ? (
          <View style={{ marginTop: 22 }}>
            <Text style={s.label}>{t.notes}</Text>
            <Text style={s.muted}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={s.footer} fixed>{t.footer}</Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
