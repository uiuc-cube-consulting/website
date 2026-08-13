"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { Lead } from "@/features/02-pipeline-crm/lib/pipeline";
import { LeadCard } from "./LeadCard";

/** Cards rendered before the "Show all" cut — keeps a 300-lead "Contacted" from
 *  turning the column into an endless scroll. */
const PAGE = 8;
/** Above this many cards a column gets its own filter box. */
const FILTER_AT = 8;

type Props = {
  label: string;
  hint: string;
  leads: Lead[];
  collapsed: boolean;
  onToggle: () => void;
  onOpen: (lead: Lead) => void;
  onMove: (lead: Lead, anchor: DOMRect) => void;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: () => void;
  /** "column" = funnel lane in the horizontal scroller; "tray" = full-width outcome bucket. */
  variant?: "column" | "tray";
};

export function PipelineColumn({
  label,
  hint,
  leads,
  collapsed,
  onToggle,
  onOpen,
  onMove,
  dragId,
  onDragStart,
  onDragEnd,
  onDrop,
  variant = "column",
}: Props) {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [over, setOver] = useState(false);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return leads;
    return leads.filter((l) => `${l.company} ${l.name} ${l.industry ?? ""} ${l.owner ?? ""}`.toLowerCase().includes(t));
  }, [leads, q]);

  const visible = showAll ? shown : shown.slice(0, PAGE);
  const hidden = shown.length - visible.length;
  const tray = variant === "tray";

  // Drop handling is shared by the expanded body and the collapsed rail, so a card
  // can be dragged into a column that's been folded away.
  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!over) setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: () => {
      setOver(false);
      onDrop();
    },
  };

  const ring = over ? "ring-2 ring-[var(--gold)] ring-offset-1" : "";

  // Collapsed funnel lane: a narrow vertical rail. Keeps every stage on screen at
  // once instead of pushing the later ones past the right edge.
  if (collapsed && !tray) {
    return (
      <section {...dropProps} className={`flex min-h-[150px] w-12 shrink-0 flex-col items-center rounded-2xl bg-[var(--bg-cream)]/60 py-3 transition ${ring}`}>
        <button
          onClick={onToggle}
          aria-expanded={false}
          aria-label={`Expand ${label} (${leads.length} leads)`}
          className="flex flex-1 flex-col items-center gap-2 text-[var(--bg-dark)]"
        >
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums">{leads.length}</span>
          <span className="font-display text-[13px] font-bold [writing-mode:vertical-rl]">{label}</span>
          <ChevronRight size={14} className="mt-auto text-[var(--muted)]" />
        </button>
      </section>
    );
  }

  return (
    <section
      {...dropProps}
      className={`flex flex-col rounded-2xl bg-[var(--bg-cream)]/60 p-3 transition ${ring} ${
        tray ? "w-full" : "w-72 shrink-0"
      }`}
    >
      <header className="px-1 pb-2">
        <button
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-2 text-left"
        >
          {collapsed ? <ChevronRight size={15} className="shrink-0 text-[var(--muted)]" /> : <ChevronDown size={15} className="shrink-0 text-[var(--muted)]" />}
          <span className="font-display text-sm font-bold text-[var(--bg-dark)]">{label}</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold tabular-nums text-[var(--bg-dark)]">
            {q.trim() ? `${shown.length}/${leads.length}` : leads.length}
          </span>
        </button>
        {!collapsed && <p className="mt-0.5 pl-[23px] text-[11px] text-[var(--muted)]">{hint}</p>}
      </header>

      {!collapsed && (
        <>
          {leads.length > FILTER_AT && (
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                aria-label={`Search within ${label}`}
                className="w-full rounded-lg border border-[var(--border)] bg-white py-1.5 pl-7 pr-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
              />
            </div>
          )}

          <div className={tray ? "grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" : "flex min-h-[40px] flex-col gap-2.5"}>
            {visible.map((l) => (
              <LeadCard
                key={l.id}
                lead={l}
                dragging={dragId === l.id}
                onOpen={() => onOpen(l)}
                onMove={(rect) => onMove(l, rect)}
                onDragStart={() => onDragStart(l.id)}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>

          {shown.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
              {q.trim() ? "No match in this stage" : "Drop a card here"}
            </p>
          )}

          {hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="mt-2 rounded-lg border border-[var(--border)] bg-white/70 px-3 py-1.5 text-xs font-semibold text-[var(--gold-deep)] hover:bg-white"
            >
              Show all {shown.length}
            </button>
          )}
          {showAll && shown.length > PAGE && (
            <button
              onClick={() => setShowAll(false)}
              className="mt-2 rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted)] hover:text-[var(--bg-dark)]"
            >
              Show less
            </button>
          )}
        </>
      )}
    </section>
  );
}
