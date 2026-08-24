"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, ExternalLink, UserPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { BoardLead } from "@/lib/leads-shared";
import { addLeadNoteAction, convertLeadAction } from "@/app/actions/leads";
import { formatMoney } from "@/lib/money";

/**
 * The side panel: full details, a note box, and the convert-to-client button.
 *
 * The board gives this a `key` of the lead's id, so opening a different lead
 * mounts a fresh copy with an empty note box — no need to reset state by hand.
 */
export function LeadDetail({
  lead, locale, onClose,
}: {
  lead: BoardLead | null;
  locale: "en" | "ar";
  onClose: () => void;
}) {
  const t = useTranslations("leads");
  const ts = useTranslations("leadSource");
  const tf = useTranslations("frequency");
  const tp = useTranslations("propertyType");
  const router = useRouter();

  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const [converting, startConverting] = useTransition();

  if (!lead) return null;

  const zone = locale === "ar" ? (lead.zoneNameAr ?? lead.zoneNameEn) : lead.zoneNameEn;
  const service = locale === "ar" ? (lead.serviceNameAr ?? lead.serviceNameEn) : lead.serviceNameEn;

  const rows: [string, string | null][] = [
    [t("detail.reference"), lead.referenceNo],
    [t("detail.phone"), lead.phone],
    [t("detail.email"), lead.email],
    [t("detail.source"), ts(lead.source)],
    [t("detail.service"), service],
    [t("detail.property"), lead.propertyType ? tp(lead.propertyType) : null],
    [t("detail.size"), lead.bedrooms ? t("beds", { count: lead.bedrooms }) : lead.sqm ? `${lead.sqm} m²` : null],
    [t("detail.frequency"), lead.frequency ? tf(lead.frequency) : null],
    [t("detail.area"), zone],
    [t("detail.estimate"), lead.estimateFils ? formatMoney(lead.estimateFils, locale) : null],
    [t("detail.quote"), lead.quoteNo],
  ];

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side={locale === "ar" ? "left" : "right"} className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            {lead.fullName}
            <Badge variant="secondary">{t(`status.${lead.status}`)}</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 p-4">
          <dl className="space-y-2 text-sm">
            {rows.filter(([, value]) => value).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted-foreground shrink-0">{label}</dt>
                <dd className="min-w-0 text-end break-words">{value}</dd>
              </div>
            ))}
          </dl>

          {lead.quoteId ? (
            <Button render={<a href={`/${locale}/quote/${lead.quoteId}`} target="_blank" rel="noopener noreferrer" />} variant="outline" className="w-full">
              <ExternalLink className="size-4" aria-hidden />
              {t("detail.viewQuote")}
            </Button>
          ) : null}

          {/* Converting is only offered once the deal is actually won. */}
          {lead.status === "WON" ? (
            <Button
              className="w-full"
              disabled={converting}
              onClick={() =>
                startConverting(async () => {
                  const result = await convertLeadAction({ leadId: lead.id, locale });
                  if (result.ok) {
                    toast.success(t("detail.converted", { clientNo: result.clientNo }));
                    onClose();
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              {converting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <UserPlus className="size-4" aria-hidden />}
              {t("detail.convert")}
            </Button>
          ) : null}

          <div>
            <Label htmlFor="lead-note">{t("detail.addNote")}</Label>
            <Textarea
              id="lead-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1.5"
              placeholder={t("detail.notePlaceholder")}
            />
            <Button
              className="mt-2 w-full"
              variant="outline"
              disabled={saving || !note.trim()}
              onClick={() =>
                startSaving(async () => {
                  const result = await addLeadNoteAction({
                    leadId: lead.id, type: "NOTE", body: note, locale,
                  });
                  if (result.ok) {
                    toast.success(t("detail.noteSaved"));
                    setNote("");
                    router.refresh();
                  } else {
                    toast.error(result.error);
                  }
                })
              }
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("detail.saveNote")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
