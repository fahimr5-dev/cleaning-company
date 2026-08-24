"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, Check, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  decideLeaveAction, reviewTimeEntryAction, saveStaffDocumentAction,
} from "@/app/actions/staff";

/**
 * Approving or refusing leave.
 *
 * PLAIN ENGLISH: approving leave never cancels the jobs that person is booked
 * on — it tells you how many need re-crewing. Silently emptying the diary would
 * be far worse than saying it out loud.
 */
export function LeaveDecision({
  requestId, locale,
}: {
  requestId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("staff.leave");
  const router = useRouter();
  const [busy, startBusy] = useTransition();

  function decide(decision: "APPROVED" | "REJECTED") {
    startBusy(async () => {
      const result = await decideLeaveAction({ requestId, decision, locale });
      if (!result.ok) { toast.error(result.error); return; }
      if (decision === "APPROVED" && result.jobsAffected > 0) {
        toast.warning(t("approvedWithJobs", { count: result.jobsAffected }), {
          description: t("recrewHint"),
        });
      } else {
        toast.success(decision === "APPROVED" ? t("approved") : t("rejected"));
      }
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 gap-1">
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide("REJECTED")}>
        <X className="size-4" aria-hidden />
        {t("reject")}
      </Button>
      <Button size="sm" disabled={busy} data-testid="approve-leave" onClick={() => decide("APPROVED")}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
        {t("approve")}
      </Button>
    </div>
  );
}

/**
 * Signing off hours clocked away from the property.
 *
 * Until somebody decides, those minutes are NOT payable — that is the whole
 * point of the queue.
 */
export function TimesheetReview({
  entryId, locale,
}: {
  entryId: string;
  locale: "en" | "ar";
}) {
  const t = useTranslations("staff.timesheets");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, startBusy] = useTransition();

  function decide(decision: "APPROVED" | "REJECTED") {
    startBusy(async () => {
      const result = await reviewTimeEntryAction({ entryId, decision, note, locale });
      if (result.ok) {
        toast.success(decision === "APPROVED" ? t("approved") : t("rejected"));
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" data-testid="review-entry" onClick={() => setOpen(true)}>
        {t("review")}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reviewTitle")}</DialogTitle>
            <DialogDescription>{t("reviewBody")}</DialogDescription>
          </DialogHeader>

          <div>
            <Label htmlFor="review-note">{t("note")}</Label>
            <Textarea
              id="review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="mt-1.5"
              placeholder={t("notePlaceholder")}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => decide("REJECTED")}>
              <X className="size-4" aria-hidden />
              {t("dontPay")}
            </Button>
            <Button disabled={busy} data-testid="confirm-approve-hours" onClick={() => decide("APPROVED")}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {t("pay")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const DOCUMENT_TYPES = [
  "VISA", "EMIRATES_ID", "LABOUR_CARD", "MEDICAL_FITNESS",
  "PASSPORT", "CONTRACT", "TRAINING_CERT", "OTHER",
] as const;

/** Recording a visa, Emirates ID or medical certificate and its expiry date. */
export function DocumentDialog({
  staffId, locale, document,
}: {
  staffId: string;
  locale: "en" | "ar";
  document?: {
    id: string;
    type: string;
    number: string | null;
    issuedAt: string | null;
    expiresAt: string | null;
    notes: string | null;
  };
}) {
  const t = useTranslations("staff.documents");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>(document?.type ?? "VISA");
  const [number, setNumber] = useState(document?.number ?? "");
  const [issuedAt, setIssuedAt] = useState(document?.issuedAt?.slice(0, 10) ?? "");
  const [expiresAt, setExpiresAt] = useState(document?.expiresAt?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(document?.notes ?? "");
  const [busy, startBusy] = useTransition();

  const renewed = Boolean(document) && expiresAt !== (document?.expiresAt?.slice(0, 10) ?? "");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant={document ? "ghost" : "outline"} />}>
        <FileText className="size-4" aria-hidden />
        {document ? t("edit") : t("add")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{document ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t("type")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {DOCUMENT_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                  className={
                    type === value
                      ? "border-primary bg-primary text-primary-foreground rounded-lg border px-3 py-2 text-xs"
                      : "hover:bg-accent rounded-lg border px-3 py-2 text-xs"
                  }
                >
                  {t(`types.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="doc-number">{t("number")}</Label>
            <Input
              id="doc-number"
              dir="ltr"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={60}
              className="mt-1.5"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="doc-issued">{t("issued")}</Label>
              <Input
                id="doc-issued"
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="doc-expires">{t("expires")}</Label>
              <Input
                id="doc-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          {renewed ? (
            <p className="rounded-lg bg-sky-50 p-3 text-xs text-sky-900 dark:bg-sky-950 dark:text-sky-200">
              {t("renewedHint")}
            </p>
          ) : null}

          <div>
            <Label htmlFor="doc-notes">{t("notes")}</Label>
            <Textarea
              id="doc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1.5"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button
            disabled={busy}
            data-testid="save-document"
            onClick={() =>
              startBusy(async () => {
                const result = await saveStaffDocumentAction({
                  staffId,
                  documentId: document?.id,
                  type,
                  number,
                  issuedAt: issuedAt || undefined,
                  expiresAt: expiresAt || undefined,
                  notes,
                  locale,
                });
                if (result.ok) {
                  toast.success(t("saved"));
                  setOpen(false);
                  router.refresh();
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
