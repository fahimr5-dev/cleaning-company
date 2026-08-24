"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import { Phone, MessageCircle, Clock, MapPin } from "lucide-react";
import type { BoardLead } from "@/lib/leads-shared";
import { formatMoney } from "@/lib/money";
import { whatsappLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/** One enquiry card on the board. Draggable, and openable for detail. */
export function LeadCard({
  lead, locale, onOpen, dragging,
}: {
  lead: BoardLead;
  locale: "en" | "ar";
  onOpen?: (lead: BoardLead) => void;
  dragging?: boolean;
}) {
  const t = useTranslations("leads");
  const ts = useTranslations("leadSource");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: lead.id });

  const zone = locale === "ar" ? (lead.zoneNameAr ?? lead.zoneNameEn) : lead.zoneNameEn;
  const service = locale === "ar" ? (lead.serviceNameAr ?? lead.serviceNameEn) : lead.serviceNameEn;
  const wa = whatsappLink(lead.phone, "");

  // A new enquiry going cold is the most expensive thing on this board.
  const stale = lead.status === "NEW" && lead.ageDays >= 2;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="lead-card"
      className={cn(
        "bg-card rounded-lg border p-3 shadow-xs",
        (isDragging || dragging) && "opacity-50",
        stale && "border-amber-400 dark:border-amber-700",
      )}
    >
      {/* The whole card is a drag handle, except the buttons at the bottom. */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onOpen?.(lead)}
            onPointerDown={(e) => e.stopPropagation()}
            className="hover:underline min-w-0 text-start text-sm font-medium"
          >
            {lead.fullName}
          </button>
          {lead.estimateFils ? (
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {formatMoney(lead.estimateFils, locale)}
            </span>
          ) : null}
        </div>

        <p className="text-muted-foreground mt-1 truncate text-xs">
          {[service, zone].filter(Boolean).join(" · ") || lead.referenceNo}
        </p>

        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="bg-muted rounded px-1.5 py-0.5">{ts(lead.source)}</span>
          <span className={cn("flex items-center gap-1", stale && "text-amber-700 dark:text-amber-400 font-medium")}>
            <Clock className="size-3" aria-hidden />
            {lead.ageDays === 0 ? t("today") : t("daysOld", { days: lead.ageDays })}
          </span>
          {lead.propertyType ? (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {lead.bedrooms ? t("beds", { count: lead.bedrooms }) : lead.sqm ? `${lead.sqm} m²` : "—"}
            </span>
          ) : null}
        </div>

        {lead.status === "LOST" && lead.lostReason ? (
          <p className="mt-2 rounded bg-red-50 px-1.5 py-1 text-[11px] text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {t(`lostReason.${lead.lostReason}`)}
          </p>
        ) : null}
      </div>

      {/* Contact shortcuts. onPointerDown stops a tap being read as a drag. */}
      <div className="mt-2.5 flex gap-1.5 border-t pt-2.5">
        <a
          href={`tel:${lead.phone}`}
          onPointerDown={(e) => e.stopPropagation()}
          className="hover:bg-accent text-muted-foreground flex flex-1 items-center justify-center gap-1 rounded border py-1 text-[11px]"
        >
          <Phone className="size-3" aria-hidden />
          {t("call")}
        </a>
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="hover:bg-accent text-muted-foreground flex flex-1 items-center justify-center gap-1 rounded border py-1 text-[11px]"
          >
            <MessageCircle className="size-3" aria-hidden />
            WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}
