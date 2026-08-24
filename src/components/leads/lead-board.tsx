"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, closestCorners,
  type DragEndEvent, type DragStartEvent, type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { toast } from "sonner";
import { LEAD_STATUSES, type BoardLead, type LeadStatus, type LeadBoard } from "@/lib/leads-shared";
import { moveLeadAction } from "@/app/actions/leads";
import { LeadCard } from "./lead-card";
import { LeadDetail } from "./lead-detail";
import { LostReasonDialog } from "./lost-reason-dialog";
import { cn } from "@/lib/utils";

/**
 * The pipeline board: New → Contacted → Quoted → Won → Lost.
 *
 * PLAIN ENGLISH: drag a card to a new column and it saves immediately. If the
 * save fails, the card springs back to where it was rather than leaving the
 * screen showing something the database does not agree with.
 */

const COLUMN_TONE: Record<LeadStatus, string> = {
  NEW: "border-t-blue-500",
  CONTACTED: "border-t-violet-500",
  QUOTED: "border-t-amber-500",
  WON: "border-t-green-600",
  LOST: "border-t-red-500",
};

export function LeadBoardView({
  board, locale,
}: {
  board: LeadBoard;
  locale: "en" | "ar";
}) {
  const t = useTranslations("leads");

  // Local copy so a drag feels instant; the server is the source of truth and
  // we snap back to it if a save is rejected.
  const [columns, setColumns] = useState(board.columns);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The column the card started in. We must remember this, because while a card
  // is being dragged we optimistically move it, so by the time the drag ends its
  // status already SAYS "Lost" — checking that would skip the reason prompt.
  const [originStatus, setOriginStatus] = useState<LeadStatus | null>(null);
  const [openLead, setOpenLead] = useState<BoardLead | null>(null);
  const [pendingLost, setPendingLost] = useState<{ lead: BoardLead; position: number } | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so tapping a card to open
    // it still works on a touchscreen.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const allLeads = useMemo(() => Object.values(columns).flat(), [columns]);
  const activeLead = allLeads.find((l) => l.id === activeId) ?? null;

  const columnOf = (id: string): LeadStatus | null =>
    (LEAD_STATUSES.find((s) => columns[s].some((l) => l.id === id)) ?? null);

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveId(id);
    setOriginStatus(columnOf(id));
  }

  /** Moves the card between columns while it is still being dragged. */
  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const from = columnOf(String(active.id));
    const to = LEAD_STATUSES.includes(over.id as LeadStatus)
      ? (over.id as LeadStatus)
      : columnOf(String(over.id));
    if (!from || !to || from === to) return;

    setColumns((prev) => {
      const lead = prev[from].find((l) => l.id === active.id);
      if (!lead) return prev;
      const overIndex = prev[to].findIndex((l) => l.id === over.id);
      const insertAt = overIndex >= 0 ? overIndex : prev[to].length;
      return {
        ...prev,
        [from]: prev[from].filter((l) => l.id !== active.id),
        [to]: [
          ...prev[to].slice(0, insertAt),
          { ...lead, status: to },
          ...prev[to].slice(insertAt),
        ],
      };
    });
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const from = originStatus;
    setActiveId(null);
    setOriginStatus(null);
    if (!over) return;

    const to = columnOf(String(active.id));
    if (!to) return;

    const index = columns[to].findIndex((l) => l.id === active.id);
    const overIndex = columns[to].findIndex((l) => l.id === over.id);
    const finalIndex = overIndex >= 0 ? overIndex : index;

    if (index !== finalIndex && index >= 0 && overIndex >= 0) {
      setColumns((prev) => ({ ...prev, [to]: arrayMove(prev[to], index, overIndex) }));
    }

    const lead = allLeads.find((l) => l.id === active.id);
    if (!lead) return;

    // Losing a deal needs a reason — that is the whole point of the report.
    // Compare against where the card CAME FROM, not its optimistic status.
    if (to === "LOST" && from !== "LOST") {
      setPendingLost({ lead: { ...lead, status: to }, position: finalIndex });
      return;
    }

    save(String(active.id), to, finalIndex, null, null);
  }

  function save(
    leadId: string, status: LeadStatus, position: number,
    lostReason: string | null, lostNote: string | null,
  ) {
    startTransition(async () => {
      const result = await moveLeadAction({ leadId, status, position, lostReason, lostNote, locale });
      if (!result.ok) {
        toast.error(result.error);
        setColumns(board.columns); // snap back to what the server actually has
      }
    });
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null);
          setOriginStatus(null);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {LEAD_STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              leads={columns[status]}
              locale={locale}
              label={t(`status.${status}`)}
              onOpen={setOpenLead}
            />
          ))}
        </div>

        {/* The card that follows the cursor while dragging. */}
        <DragOverlay>
          {activeLead ? (
            <div className="rotate-1">
              <LeadCard lead={activeLead} locale={locale} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <LostReasonDialog
        open={pendingLost !== null}
        onCancel={() => {
          setPendingLost(null);
          setColumns(board.columns);
        }}
        onConfirm={(reason, note) => {
          if (!pendingLost) return;
          save(pendingLost.lead.id, "LOST", pendingLost.position, reason, note);
          setPendingLost(null);
        }}
      />

      <LeadDetail key={openLead?.id ?? "none"} lead={openLead} locale={locale} onClose={() => setOpenLead(null)} />
    </>
  );
}

function Column({
  status, leads, locale, label, onOpen,
}: {
  status: LeadStatus;
  leads: BoardLead[];
  locale: "en" | "ar";
  label: string;
  onOpen: (lead: BoardLead) => void;
}) {
  // Makes the whole column a drop target, so an empty column still accepts cards.
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${status}`}
      className={cn(
        "bg-muted/40 flex min-h-32 flex-col rounded-lg border-t-3 p-2 transition-colors",
        COLUMN_TONE[status],
        isOver && "bg-accent",
      )}
    >
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{leads.length}</span>
      </div>

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} locale={locale} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
