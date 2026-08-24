import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Download, AlertTriangle } from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/queries/invoices";
import { checkCreditNote } from "@/lib/billing";
import { isStripeConfigured } from "@/lib/stripe";
import { formatMoney } from "@/lib/money";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { RecordPayment } from "@/components/invoices/record-payment";
import { CreditNoteDialog } from "@/components/invoices/credit-note-dialog";
import {
  SendInvoiceButton, ReconcileButton, ApplyCreditButton,
} from "@/components/invoices/invoice-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Auth-dependent, so it must be rendered per request and never prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const invoice = await getInvoiceDetail(id);
  return { title: invoice ? invoice.invoiceNo : "Invoice" };
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  // An operations manager may read an invoice but never change money — the
  // database enforces the same rule independently.
  const user = await requireRole(locale, ...OFFICE_ROLES);
  const isOwner = user.role === "OWNER";

  const invoice = await getInvoiceDetail(id);
  if (!invoice) notFound();

  const t = await getTranslations("invoices");
  const isArabic = locale === "ar";
  const lang: "en" | "ar" = isArabic ? "ar" : "en";
  const money = (fils: number) => formatMoney(fils, lang);
  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short", year: "numeric",
  });
  const dateTimeFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  const creditedFils = invoice.creditNotes
    .filter((note) => note.status !== "VOID")
    .reduce((total, note) => total + note.totalFils, 0);

  const creditCheck = checkCreditNote({
    invoiceTotalFils: invoice.totalFils,
    alreadyCreditedFils: creditedFils,
    requestedFils: 0,
    isVoid: invoice.status === "VOID",
  });

  const hasCardPayment = invoice.payments.some(
    (payment) => payment.method === "CARD_STRIPE" && payment.status === "SUCCEEDED",
  );

  const client = invoice.client;
  const clientName = invoice.buyerName ?? client.companyName ?? client.contactName;

  return (
    <div className="space-y-6">
      <Link
        href={`/${locale}/invoices`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tabular-nums">{invoice.invoiceNo}</h1>
            <InvoiceStatusBadge status={invoice.status} label={t(`status.${invoice.status}`)} />
            {invoice.type !== "STANDARD" ? (
              <Badge variant="secondary">{t(`types.${invoice.type}`)}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            <Link href={`/${locale}/clients/${client.id}`} className="hover:underline">
              {clientName}
            </Link>
            {" · "}
            {t("issuedOn", { date: dateFmt.format(invoice.issueDate) })}
            {" · "}
            {t("dueOn", { date: dateFmt.format(invoice.dueDate) })}
          </p>
          {invoice.periodStart && invoice.periodEnd ? (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {t("period", {
                from: dateFmt.format(invoice.periodStart),
                to: dateFmt.format(invoice.periodEnd),
              })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<a href={`/api/invoice/${invoice.id}/pdf`} target="_blank" rel="noopener noreferrer" />}
          >
            <Download className="size-4" aria-hidden />
            {t("downloadPdf")}
          </Button>
          {isOwner ? (
            <SendInvoiceButton
              invoiceId={invoice.id}
              locale={lang}
              alreadySent={Boolean(invoice.sentAt)}
            />
          ) : null}
        </div>
      </div>

      {client.isBookingPaused ? (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <p>{t("clientPaused", { name: clientName })}</p>
          </CardContent>
        </Card>
      ) : null}

      {/* Money first, because that is the question the owner is actually asking. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t("lines.description")}</th>
                    <th className="p-3 text-end font-medium">{t("lines.quantity")}</th>
                    <th className="p-3 text-end font-medium">{t("lines.unitPrice")}</th>
                    <th className="p-3 text-end font-medium">{t("lines.vat")}</th>
                    <th className="p-3 text-end font-medium">{t("lines.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="border-t">
                      <td className="p-3">
                        {isArabic ? (line.descriptionAr ?? line.descriptionEn) : line.descriptionEn}
                        {line.discountFils > 0 ? (
                          <span className="text-muted-foreground block text-xs">
                            {t("lines.discount", { amount: money(line.discountFils) })}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-3 text-end tabular-nums">{Number(line.quantity)}</td>
                      <td className="p-3 text-end tabular-nums">{money(line.unitPriceFils)}</td>
                      <td className="p-3 text-end tabular-nums">
                        {money(line.vatFils)}
                        <span className="text-muted-foreground block text-[11px]">
                          {(line.vatRateBps / 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="p-3 text-end tabular-nums">{money(line.lineTotalFils)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t">
                  <tr>
                    <td colSpan={4} className="text-muted-foreground p-3 text-end">{t("totals.subtotal")}</td>
                    <td className="p-3 text-end tabular-nums">{money(invoice.subtotalFils)}</td>
                  </tr>
                  {invoice.discountFils > 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted-foreground p-3 text-end">{t("totals.discount")}</td>
                      <td className="p-3 text-end tabular-nums">−{money(invoice.discountFils)}</td>
                    </tr>
                  ) : null}
                  <tr>
                    <td colSpan={4} className="text-muted-foreground p-3 text-end">
                      {t("totals.vat", { rate: (invoice.vatRateBps / 100).toFixed(0) })}
                    </td>
                    <td className="p-3 text-end tabular-nums">{money(invoice.vatFils)}</td>
                  </tr>
                  <tr className="border-t font-semibold">
                    <td colSpan={4} className="p-3 text-end">{t("totals.total")}</td>
                    <td className="p-3 text-end tabular-nums" data-testid="invoice-total">{money(invoice.totalFils)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="text-muted-foreground p-3 text-end">{t("totals.paid")}</td>
                    <td className="p-3 text-end tabular-nums">{money(invoice.amountPaidFils)}</td>
                  </tr>
                  {creditedFils > 0 ? (
                    <tr>
                      <td colSpan={4} className="text-muted-foreground p-3 text-end">{t("totals.credited")}</td>
                      <td className="p-3 text-end tabular-nums">−{money(creditedFils)}</td>
                    </tr>
                  ) : null}
                  <tr className="border-t font-semibold">
                    <td colSpan={4} className="p-3 text-end">{t("totals.balance")}</td>
                    <td className="p-3 text-end tabular-nums" data-testid="invoice-balance">
                      {money(invoice.balanceFils)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="text-sm font-medium">{t("actions")}</h2>
              {!isOwner ? (
                <p className="text-muted-foreground text-sm">{t("readOnly")}</p>
              ) : invoice.status === "VOID" ? (
                <p className="text-muted-foreground text-sm">{t("voided")}</p>
              ) : (
                <>
                  {invoice.balanceFils > 0 ? (
                    <RecordPayment
                      invoiceId={invoice.id}
                      balanceFils={invoice.balanceFils}
                      locale={lang}
                      stripeReady={isStripeConfigured()}
                      hasPayLink={Boolean(invoice.stripePaymentLinkUrl)}
                      payUrl={invoice.stripePaymentLinkUrl}
                    />
                  ) : (
                    <p className="text-sm text-emerald-700 dark:text-emerald-400">{t("settled")}</p>
                  )}
                  {creditCheck.maxCreditableFils > 0 ? (
                    <CreditNoteDialog
                      invoiceId={invoice.id}
                      maxCreditableFils={creditCheck.maxCreditableFils}
                      hasCardPayment={hasCardPayment}
                      locale={lang}
                    />
                  ) : null}
                  {client.creditBalanceFils > 0 && invoice.balanceFils > 0 ? (
                    <ApplyCreditButton
                      clientId={client.id}
                      creditFils={client.creditBalanceFils}
                      locale={lang}
                    />
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          {/* The frozen tax details. Once issued, these never move — that is the
              whole point of a tax invoice. */}
          <Card>
            <CardContent className="p-5 text-sm">
              <h2 className="mb-3 text-sm font-medium">{t("taxDetails")}</h2>
              <dl className="space-y-2">
                <div>
                  <dt className="text-muted-foreground text-xs">{t("supplier")}</dt>
                  <dd>{invoice.supplierName ?? "—"}</dd>
                  {invoice.supplierTrn ? (
                    <dd className="text-muted-foreground text-xs" dir="ltr">
                      {t("trn")}: {invoice.supplierTrn}
                    </dd>
                  ) : null}
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">{t("buyer")}</dt>
                  <dd>{invoice.buyerName ?? clientName}</dd>
                  {invoice.buyerTrn ? (
                    <dd className="text-muted-foreground text-xs" dir="ltr">
                      {t("trn")}: {invoice.buyerTrn}
                    </dd>
                  ) : null}
                  {invoice.buyerAddress ? (
                    <dd className="text-muted-foreground text-xs">{invoice.buyerAddress}</dd>
                  ) : null}
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-medium">{t("payments.title")}</h2>
            {invoice.payments.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("payments.none")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="flex items-start justify-between gap-3 py-2.5" data-testid="payment-row">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">{money(payment.amountFils)}</p>
                      <p className="text-muted-foreground text-xs">
                        {t(`record.methods.${payment.method}`)} · {dateFmt.format(payment.receivedAt)}
                        {payment.reference ? ` · ${payment.reference}` : ""}
                      </p>
                      {payment.status !== "SUCCEEDED" ? (
                        <Badge variant="destructive" className="mt-1 text-[10px]">
                          {t(`payments.status.${payment.status}`)}
                        </Badge>
                      ) : null}
                    </div>
                    {payment.reconciledAt ? (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {t("payments.reconciledOn", { date: dateFmt.format(payment.reconciledAt) })}
                      </span>
                    ) : isOwner ? (
                      <ReconcileButton paymentId={payment.id} locale={lang} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-medium">{t("reminders.title")}</h2>
            {invoice.dunningEvents.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("reminders.none")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {invoice.dunningEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3">
                    <span>
                      {t("reminders.step", { step: event.step })}
                      <span className="text-muted-foreground ms-2 text-xs">
                        {event.sentAt
                          ? dateTimeFmt.format(event.sentAt)
                          : dateFmt.format(event.scheduledFor)}
                      </span>
                    </span>
                    <Badge
                      variant={event.status === "FAILED" ? "destructive" : "secondary"}
                      data-status={event.status}
                      className="text-[10px]"
                    >
                      {t(`reminders.status.${event.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {invoice.creditNotes.length > 0 ? (
              <>
                <h2 className="mt-5 mb-3 text-sm font-medium">{t("credit.listTitle")}</h2>
                <ul className="divide-y text-sm">
                  {invoice.creditNotes.map((note) => (
                    <li key={note.id} className="py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="tabular-nums">{note.creditNoteNo}</span>
                        <span className="tabular-nums">−{money(note.totalFils)}</span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        {dateFmt.format(note.issueDate)} · {note.reason}
                      </p>
                      {note.refundedAmountFils > 0 ? (
                        <p className="text-muted-foreground text-xs">
                          {t("credit.refunded", { amount: money(note.refundedAmountFils) })}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {invoice.jobs.length > 0 ? (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-medium">{t("jobs.title")}</h2>
            <ul className="divide-y text-sm">
              {invoice.jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    {/* There is no single-job page yet, so this opens the job
                        list already filtered down to this one job. */}
                    <Link
                      href={`/${locale}/jobs?q=${encodeURIComponent(job.jobNo)}`}
                      className="font-medium tabular-nums hover:underline"
                    >
                      {job.jobNo}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {isArabic ? job.serviceType.nameAr : job.serviceType.nameEn}
                      {" · "}
                      {dateFmt.format(job.scheduledStart)}
                    </p>
                  </div>
                  <span className="tabular-nums">{money(job.totalFils)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
