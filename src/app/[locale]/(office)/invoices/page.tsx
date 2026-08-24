import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ReceiptText, Wallet, AlarmClock, CircleDollarSign } from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getInvoices } from "@/lib/queries/invoices";
import { formatMoney } from "@/lib/money";
import { InvoiceFilters } from "@/components/invoices/invoice-filters";
import { InvoiceStatusBadge } from "@/components/invoices/invoice-status-badge";
import { MonthlyRunButton } from "@/components/invoices/monthly-run-button";
import { StatCard } from "@/components/common/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** Auth-dependent, so it must be rendered per request and never prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("invoices") };
}

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  // An operations manager may read invoices but never change money — the
  // database enforces the same rule independently.
  const user = await requireRole(locale, ...OFFICE_ROLES);
  const isOwner = user.role === "OWNER";

  const t = await getTranslations("invoices");
  const isArabic = locale === "ar";
  const money = (fils: number) => formatMoney(fils, isArabic ? "ar" : "en");
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const page = Number(one(sp.page) ?? "1") || 1;
  const result = await getInvoices({
    search: one(sp.q),
    status: one(sp.status),
    page,
  });

  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short", year: "numeric",
  });
  const totalPages = Math.ceil(result.total / result.pageSize);

  const AGING: Array<{ key: "CURRENT" | "DAYS_0_30" | "DAYS_31_60" | "DAYS_60_PLUS"; tone: string }> = [
    { key: "CURRENT", tone: "text-muted-foreground" },
    { key: "DAYS_0_30", tone: "text-amber-700 dark:text-amber-400" },
    { key: "DAYS_31_60", tone: "text-orange-700 dark:text-orange-400" },
    { key: "DAYS_60_PLUS", tone: "text-red-700 dark:text-red-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
        </div>
        {isOwner ? <MonthlyRunButton locale={isArabic ? "ar" : "en"} /> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={ReceiptText}
          label={t("stats.invoiced")}
          value={money(result.summary.invoicedFils)}
          hint={t("stats.invoicedHint", { count: num.format(result.summary.invoiceCount) })}
        />
        <StatCard
          icon={CircleDollarSign}
          label={t("stats.collected")}
          value={money(result.summary.collectedFils)}
          hint={t("stats.collectedHint")}
        />
        <StatCard
          icon={Wallet}
          label={t("stats.outstanding")}
          value={money(result.summary.outstandingFils)}
          hint={t("stats.outstandingHint")}
          tone={result.summary.outstandingFils > 0 ? "warning" : "default"}
        />
        <StatCard
          icon={AlarmClock}
          label={t("stats.overdue")}
          value={num.format(result.summary.overdueCount)}
          hint={t("stats.overdueHint")}
          tone={result.summary.overdueCount > 0 ? "danger" : "default"}
        />
      </div>

      {/* Aged receivables: how old the money owed to you actually is. */}
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-medium">{t("aging.title")}</h2>
          <p className="text-muted-foreground text-xs">{t("aging.hint")}</p>
          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            {AGING.map((bucket) => (
              <div key={bucket.key} data-testid={`aging-${bucket.key}`}>
                <dt className="text-muted-foreground text-xs">{t(`aging.buckets.${bucket.key}`)}</dt>
                <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${bucket.tone}`}>
                  {money(result.aged[bucket.key])}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <InvoiceFilters total={result.total} />

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-16 text-center text-sm">
            {t("empty")}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          {/* One table on desktop; the same data as stacked cards on a phone. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t("table.invoice")}</th>
                  <th className="p-3 text-start font-medium">{t("table.client")}</th>
                  <th className="p-3 text-start font-medium">{t("table.issued")}</th>
                  <th className="p-3 text-start font-medium">{t("table.due")}</th>
                  <th className="p-3 text-end font-medium">{t("table.total")}</th>
                  <th className="p-3 text-end font-medium">{t("table.balance")}</th>
                  <th className="p-3 text-start font-medium">{t("table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40 border-t" data-testid="invoice-row" data-status={row.status}>
                    <td className="p-3">
                      <Link
                        href={`/${locale}/invoices/${row.id}`}
                        className="font-medium tabular-nums hover:underline"
                      >
                        {row.invoiceNo}
                      </Link>
                      <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {row.type !== "STANDARD" ? (
                          <Badge variant="secondary" className="text-[10px]">{t(`types.${row.type}`)}</Badge>
                        ) : null}
                        {row.jobCount > 1 ? <span>{t("jobCount", { count: row.jobCount })}</span> : null}
                      </div>
                    </td>
                    <td className="p-3">
                      <Link href={`/${locale}/clients/${row.clientId}`} className="hover:underline">
                        {row.clientName}
                      </Link>
                    </td>
                    <td className="text-muted-foreground p-3 text-xs">{dateFmt.format(new Date(row.issueDate))}</td>
                    <td className="p-3 text-xs">
                      <span className={row.daysOverdue > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>
                        {dateFmt.format(new Date(row.dueDate))}
                      </span>
                      {row.daysOverdue > 0 ? (
                        <span className="mt-0.5 block text-[11px] text-red-700 dark:text-red-400">
                          {t("daysOverdue", { days: num.format(row.daysOverdue) })}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3 text-end tabular-nums">{money(row.totalFils)}</td>
                    <td className={`p-3 text-end tabular-nums ${row.balanceFils > 0 ? "font-medium" : "text-muted-foreground"}`}>
                      {row.balanceFils > 0 ? money(row.balanceFils) : "—"}
                    </td>
                    <td className="p-3">
                      <InvoiceStatusBadge status={row.status} label={t(`status.${row.status}`)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y md:hidden">
            {result.rows.map((row) => (
              <li key={row.id} className="p-4" data-testid="invoice-card" data-status={row.status}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/${locale}/invoices/${row.id}`} className="font-medium tabular-nums hover:underline">
                    {row.invoiceNo}
                  </Link>
                  <InvoiceStatusBadge status={row.status} label={t(`status.${row.status}`)} />
                </div>
                <p className="text-muted-foreground mt-1 text-sm">{row.clientName}</p>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={row.daysOverdue > 0 ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}>
                    {t("table.due")}: {dateFmt.format(new Date(row.dueDate))}
                  </span>
                  <span className="tabular-nums font-medium">
                    {row.balanceFils > 0 ? money(row.balanceFils) : money(row.totalFils)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            {t("pageOf", { page: num.format(page), total: num.format(totalPages) })}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Button variant="outline" size="sm" render={<Link href={{ query: { ...sp, page: page - 1 } }} />}>
                {t("previous")}
              </Button>
            ) : null}
            {page < totalPages ? (
              <Button variant="outline" size="sm" render={<Link href={{ query: { ...sp, page: page + 1 } }} />}>
                {t("next")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
