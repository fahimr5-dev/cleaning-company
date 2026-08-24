import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Users, Building2, PauseCircle, Wallet } from "lucide-react";
import { requireRole, OFFICE_ROLES } from "@/lib/auth";
import { getClients } from "@/lib/queries/clients";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { ClientFilters } from "@/components/clients/client-filters";
import { StatCard } from "@/components/common/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return { title: t("clients") };
}

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(locale, ...OFFICE_ROLES);

  const t = await getTranslations("clients");
  const isArabic = locale === "ar";
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const page = Number(one(sp.page) ?? "1") || 1;
  const result = await getClients({
    search: one(sp.q),
    type: one(sp.type),
    status: one(sp.status),
    page,
  });

  const [activeCount, commercialCount, pausedCount, outstanding] = await Promise.all([
    prisma.client.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.client.count({ where: { deletedAt: null, type: "COMMERCIAL" } }),
    prisma.client.count({ where: { deletedAt: null, isBookingPaused: true } }),
    prisma.invoice.aggregate({
      where: { deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] } },
      _sum: { balanceFils: true },
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short", year: "numeric",
  });
  const totalPages = Math.ceil(result.total / result.pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label={t("stats.active")} value={num.format(activeCount)} />
        <StatCard icon={Building2} label={t("stats.commercial")} value={num.format(commercialCount)} hint={t("stats.commercialHint")} />
        <StatCard icon={PauseCircle} label={t("stats.paused")} value={num.format(pausedCount)} hint={t("stats.pausedHint")} tone={pausedCount > 0 ? "warning" : "default"} />
        <StatCard
          icon={Wallet}
          label={t("stats.outstanding")}
          value={formatMoney(outstanding._sum?.balanceFils ?? 0, isArabic ? "ar" : "en")}
          tone={(outstanding._sum?.balanceFils ?? 0) > 0 ? "warning" : "default"}
        />
      </div>

      <ClientFilters total={result.total} />

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
                  <th className="p-3 text-start font-medium">{t("table.client")}</th>
                  <th className="p-3 text-start font-medium">{t("table.contact")}</th>
                  <th className="p-3 text-start font-medium">{t("table.area")}</th>
                  <th className="p-3 text-end font-medium">{t("table.jobs")}</th>
                  <th className="p-3 text-end font-medium">{t("table.lifetime")}</th>
                  <th className="p-3 text-end font-medium">{t("table.outstanding")}</th>
                  <th className="p-3 text-start font-medium">{t("table.lastJob")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-muted/40 border-t">
                    <td className="p-3">
                      <Link href={`/${locale}/clients/${row.id}`} className="font-medium hover:underline">
                        {row.displayName}
                      </Link>
                      <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span>{row.clientNo}</span>
                        {row.type === "COMMERCIAL" ? <Badge variant="secondary" className="text-[10px]">{t("commercial")}</Badge> : null}
                        {row.isBookingPaused ? <Badge variant="destructive" className="text-[10px]">{t("paused")}</Badge> : null}
                      </div>
                    </td>
                    <td className="p-3">
                      <span dir="ltr" className="block">{row.phone}</span>
                      {row.email ? <span dir="ltr" className="text-muted-foreground block truncate text-xs">{row.email}</span> : null}
                    </td>
                    <td className="text-muted-foreground p-3">
                      {(isArabic ? (row.zoneNameAr ?? row.zoneNameEn) : row.zoneNameEn) ?? "—"}
                    </td>
                    <td className="p-3 text-end tabular-nums">{num.format(row.jobCount)}</td>
                    <td className="p-3 text-end tabular-nums">{formatMoney(row.lifetimeValueFils, isArabic ? "ar" : "en")}</td>
                    <td className={`p-3 text-end tabular-nums ${row.outstandingFils > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                      {row.outstandingFils > 0 ? formatMoney(row.outstandingFils, isArabic ? "ar" : "en") : "—"}
                    </td>
                    <td className="text-muted-foreground p-3 text-xs">
                      {row.lastJobAt ? dateFmt.format(new Date(row.lastJobAt)) : t("never")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y md:hidden">
            {result.rows.map((row) => (
              <li key={row.id} className="p-4">
                <Link href={`/${locale}/clients/${row.id}`} className="font-medium hover:underline">
                  {row.displayName}
                </Link>
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span>{row.clientNo}</span>
                  {row.type === "COMMERCIAL" ? <Badge variant="secondary" className="text-[10px]">{t("commercial")}</Badge> : null}
                  {row.isBookingPaused ? <Badge variant="destructive" className="text-[10px]">{t("paused")}</Badge> : null}
                </div>
                <p className="text-muted-foreground mt-1.5 text-xs" dir="ltr">{row.phone}</p>
                <div className="mt-2 flex justify-between text-xs">
                  <span className="text-muted-foreground">{t("table.jobs")}: {num.format(row.jobCount)}</span>
                  <span className="tabular-nums">{formatMoney(row.lifetimeValueFils, isArabic ? "ar" : "en")}</span>
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
