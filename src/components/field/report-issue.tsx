"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ISSUE_TYPES, type IssueType } from "@/lib/field-shared";
import { reportIssueAction } from "@/app/actions/field";

/**
 * Reporting a problem from site.
 *
 * PLAIN ENGLISH: damage, nobody home, or an unhappy client. This raises a
 * ticket in the office immediately — the cleaner does not have to phone anyone,
 * and there is a written record with a time on it.
 */
export function ReportIssue({ jobId, locale }: { jobId: string; locale: "en" | "ar" }) {
  const t = useTranslations("field.issue");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IssueType>("DAMAGE");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [busy, startBusy] = useTransition();

  function submit() {
    startBusy(async () => {
      const result = await reportIssueAction({ jobId, type, subject, description, locale });
      if (result.ok) {
        toast.success(t("sent", { ticketNo: result.ticketNo }));
        setOpen(false);
        setSubject("");
        setDescription("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" className="h-12 w-full" />}>
        <TriangleAlert className="size-4" aria-hidden />
        {t("button")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("body")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t("type")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {ISSUE_TYPES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={type === value}
                  onClick={() => setType(value)}
                  className={
                    type === value
                      ? "border-primary bg-primary text-primary-foreground rounded-lg border px-3 py-2.5 text-sm"
                      : "hover:bg-accent rounded-lg border px-3 py-2.5 text-sm"
                  }
                >
                  {t(`types.${value}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="issue-subject">{t("subject")}</Label>
            <Input
              id="issue-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              className="mt-1.5"
              placeholder={t("subjectPlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="issue-detail">{t("detail")}</Label>
            <Textarea
              id="issue-detail"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              className="mt-1.5"
              placeholder={t("detailPlaceholder")}
            />
          </div>

          {type === "NO_ACCESS" ? (
            <p className="text-muted-foreground rounded-lg bg-amber-50 p-2.5 text-xs dark:bg-amber-950/50">
              {t("noAccessNote")}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
          <Button disabled={busy || subject.trim().length < 3 || !description.trim()} onClick={submit}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
