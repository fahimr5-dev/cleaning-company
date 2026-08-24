import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ShieldAlert, Phone, Mail } from "lucide-react";
import { requireRole, OFFICE_ROLES, canSeeSalary } from "@/lib/auth";
import { getStaffDetail } from "@/lib/queries/staff";
import { formatMoney } from "@/lib/money";
import { ComplianceBadge } from "@/components/staff/compliance-badge";
import { DocumentDialog, TimesheetReview } from "@/components/staff/staff-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/** Auth-dependent, so it must be rendered per request and never prerendered. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ locale: string; id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const detail = await getStaffDetail(id, { canSeeSalary: false });
  return { title: detail ? `${detail.person.firstName} ${detail.person.lastName}` : "Staff" };
}

export default async function StaffDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireRole(locale, ...OFFICE_ROLES);
  const showSalary = canSeeSalary(user.role);

  const detail = await getStaffDetail(id, { canSeeSalary: showSalary });
  if (!detail) notFound();

  const { person, compliance, documents, balance, hours } = detail;
  const t = await getTranslations("staff");
  const isArabic = locale === "ar";
  const lang: "en" | "ar" = isArabic ? "ar" : "en";
  const num = new Intl.NumberFormat(isArabic ? "ar-AE" : "en-AE");
  const dateFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short", year: "numeric",
  });
  const shortFmt = new Intl.DateTimeFormat(isArabic ? "ar-AE" : "en-AE", {
    day: "numeric", month: "short",
  });

  return (
    <div className="space-y-6">
      <Link
        href={`/${locale}/staff`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden />
        {t("backToList")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{person.firstName} {person.lastName}</h1>
            <ComplianceBadge status={compliance.status} label={t(`compliance.${compliance.status}`)} />
            {person.employmentStatus !== "ACTIVE" ? (
              <Badge variant="secondary">{t(`filters.statusValues.${person.employmentStatus}`)}</Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {person.employeeNo} · {t(`positions.${person.position}`)}
            {person.nationality ? ` · ${person.nationality}` : ""}
            {" · "}
            {t("hiredOn", { date: dateFmt.format(person.hiredAt) })}
          </p>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1" dir="ltr">
              <Phone className="size-3" aria-hidden />{person.phone}
            </span>
            {person.email ? (
              <span className="inline-flex items-center gap-1" dir="ltr">
                <Mail className="size-3" aria-hidden />{person.email}
              </span>
            ) : null}
          </p>
        </div>

        <DocumentDialog staffId={person.id} locale={lang} />
      </div>

      {compliance.blockedFromWork ? (
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
            <p data-testid="cannot-work">{t("compliance.cannotWorkLong")}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Documents — the legal half of the page. */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-medium">{t("documents.title")}</h2>
            {documents.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm" data-testid="documents-empty">
                {t("documents.none")}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-start justify-between gap-3 py-3" data-testid="document-row" data-status={doc.check.status}>
                    <div className="min-w-0">
                      <p className="font-medium">{t(`documents.types.${doc.type}`)}</p>
                      <p className="text-muted-foreground text-xs" dir="ltr">
                        {doc.number ?? "—"}
                      </p>
                      {doc.notes ? (
                        <p className="text-muted-foreground mt-0.5 text-xs">{doc.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-end">
                        <ComplianceBadge
                          status={doc.check.status}
                          label={
                            doc.check.status === "EXPIRING" && doc.check.daysUntilExpiry !== null
                              ? t("compliance.expiringIn", { days: num.format(doc.check.daysUntilExpiry) })
                              : t(`compliance.${doc.check.status}`)
                          }
                        />
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {doc.expiresAt ? dateFmt.format(doc.expiresAt) : t("documents.noExpiry")}
                        </p>
                      </div>
                      <DocumentDialog
                        staffId={person.id}
                        locale={lang}
                        document={{
                          id: doc.id,
                          type: doc.type,
                          number: doc.number,
                          issuedAt: doc.issuedAt?.toISOString() ?? null,
                          expiresAt: doc.expiresAt?.toISOString() ?? null,
                          notes: doc.notes,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Leave balance. */}
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-3 text-sm font-medium">{t("leave.balanceTitle")}</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("leave.entitlement")}</dt>
                  <dd className="tabular-nums">{num.format(balance.entitlementDays)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("leave.taken")}</dt>
                  <dd className="tabular-nums">{num.format(balance.takenDays)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t("leave.booked")}</dt>
                  <dd className="tabular-nums">{num.format(balance.bookedDays)}</dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-medium">
                  <dt>{t("leave.remaining")}</dt>
                  <dd className="tabular-nums" data-testid="leave-remaining">
                    {num.format(balance.remainingDays)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {/* Pay — owner only, in the app AND in the database. */}
          {showSalary ? (
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 text-sm font-medium">{t("pay.title")}</h2>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("pay.basic")}</dt>
                    <dd className="tabular-nums">{formatMoney(person.basicSalaryFils ?? 0, lang)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t("pay.allowances")}</dt>
                    <dd className="tabular-nums">{formatMoney(person.allowancesFils ?? 0, lang)}</dd>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-medium">
                    <dt>{t("pay.package")}</dt>
                    <dd className="tabular-nums">
                      {formatMoney((person.basicSalaryFils ?? 0) + (person.allowancesFils ?? 0), lang)}
                    </dd>
                  </div>
                </dl>
                <p className="text-muted-foreground mt-3 border-t pt-3 text-xs" dir="ltr">
                  {person.iban ?? t("pay.noIban")}
                </p>
                <p className="text-muted-foreground text-xs">{t("pay.wpsNote")}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-1 text-sm font-medium">{t("pay.title")}</h2>
                <p className="text-muted-foreground text-sm" data-testid="salary-hidden">
                  {t("pay.hidden")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent leave. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-medium">{t("leave.historyTitle")}</h2>
            {person.leaveRequests.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">{t("leave.noHistory")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {person.leaveRequests.map((request) => (
                  <li key={request.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div>
                      <p>{t(`leave.types.${request.type}`)}</p>
                      <p className="text-muted-foreground text-xs">
                        {shortFmt.format(request.startDate)} – {shortFmt.format(request.endDate)}
                        {" · "}
                        {t("leave.daysCount", { days: num.format(request.days) })}
                      </p>
                    </div>
                    <Badge
                      variant={request.status === "REJECTED" ? "destructive" : "secondary"}
                      className="text-[10px]"
                      data-status={request.status}
                    >
                      {t(`leave.status.${request.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent hours. */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 text-sm font-medium">{t("timesheets.recentTitle")}</h2>
            <p className="text-muted-foreground mb-3 text-xs">
              {t("timesheets.payable", { hours: num.format(hours.payableHours) })}
              {hours.entriesAwaitingReview > 0
                ? ` · ${t("timesheets.awaiting", { count: num.format(hours.entriesAwaitingReview) })}`
                : ""}
            </p>
            {person.timeEntries.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">{t("timesheets.noHistory")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {person.timeEntries.slice(0, 10).map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div>
                      <p className="tabular-nums">{entry.job?.jobNo ?? t("timesheets.noJob")}</p>
                      <p className="text-muted-foreground text-xs">
                        {shortFmt.format(entry.clockInAt)}
                        {" · "}
                        {t("timesheets.minutes", { minutes: num.format(entry.minutesWorked ?? 0) })}
                      </p>
                    </div>
                    {entry.reviewStatus === "PENDING" ? (
                      <TimesheetReview entryId={entry.id} locale={lang} />
                    ) : (
                      <Badge variant="secondary" className="text-[10px]" data-status={entry.reviewStatus}>
                        {t(`timesheets.status.${entry.reviewStatus}`)}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
