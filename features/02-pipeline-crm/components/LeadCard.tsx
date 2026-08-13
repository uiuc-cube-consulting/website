"use client";

import { useRef } from "react";
import { MoveRight } from "lucide-react";
import type { Lead } from "@/features/02-pipeline-crm/lib/pipeline";

const SOURCE_STYLES: Record<string, string> = {
  apollo: "bg-blue-100 text-blue-800",
  prospects: "bg-emerald-100 text-emerald-800",
  alumni: "bg-amber-100 text-amber-900",
  inbound: "bg-violet-100 text-violet-800",
  unknown: "bg-[var(--bg-cream)] text-[var(--muted)]",
};

function lastTouch(lead: Lead): string | undefined {
  return lead.lastContacted || lead.shippedAt || lead.activeAt || lead.loiAt || lead.callAt || lead.repliedAt || lead.contactedAt;
}

type Props = {
  lead: Lead;
  dragging?: boolean;
  onOpen?: () => void;
  /** Opens the stage menu, anchored to the move button's rect. */
  onMove?: (anchor: DOMRect) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
};

export function LeadCard({ lead, dragging, onOpen, onMove, onDragStart, onDragEnd }: Props) {
  const moveRef = useRef<HTMLButtonElement>(null);
  const source = lead.source || "unknown";
  const touch = lastTouch(lead);

  function openMenu() {
    const rect = moveRef.current?.getBoundingClientRect();
    if (rect) onMove?.(rect);
  }

  return (
    <article
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      // Keyboard parity for the two mouse gestures: Enter/Space edits, M moves.
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.();
        } else if (e.key.toLowerCase() === "m" && onMove) {
          e.preventDefault();
          openMenu();
        }
      }}
      // Right-click anywhere on the card is a shortcut to the same stage menu.
      onContextMenu={(e) => {
        if (!onMove) return;
        e.preventDefault();
        openMenu();
      }}
      className={`group relative rounded-xl border border-[var(--border)] bg-white p-3.5 pb-9 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] ${
        onDragStart ? "cursor-grab active:cursor-grabbing" : ""
      } ${dragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[15px] font-bold leading-tight text-[var(--bg-dark)]">{lead.company}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SOURCE_STYLES[source] ?? SOURCE_STYLES.unknown}`}>
          {source}
        </span>
      </div>
      {lead.name && lead.name !== lead.company && (
        <p className="mt-0.5 text-[13px] text-[var(--muted)]">{lead.name}</p>
      )}
      {lead.industry && (
        <p className="mt-2 inline-block rounded-md bg-[var(--bg-cream)] px-2 py-0.5 text-[11px] text-[var(--bg-dark)]/70">{lead.industry}</p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
        <span className="truncate">{lead.owner || "Unassigned"}</span>
        {touch && <span className="shrink-0 tabular-nums">{touch}</span>}
      </div>

      {onMove && (
        <button
          ref={moveRef}
          draggable={false}
          onClick={(e) => {
            e.stopPropagation(); // don't also open the editor
            openMenu();
          }}
          aria-label={`Move ${lead.company} to another stage`}
          title="Move to stage"
          // Always visible, not hover-revealed: restaging is the primary action on
          // this board, so the control that does it shouldn't be hidden.
          className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--muted)] shadow-sm transition hover:border-[var(--gold)] hover:bg-[var(--gold)]/10 hover:text-[var(--gold-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] group-hover:border-[var(--gold)]/60"
        >
          Move <MoveRight size={12} />
        </button>
      )}
    </article>
  );
}
