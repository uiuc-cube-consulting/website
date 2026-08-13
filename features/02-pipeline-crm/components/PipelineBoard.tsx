"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronsDownUp, ChevronsUpDown, Search } from "lucide-react";
import {
  BOARD_STAGES,
  OUTCOME_STAGES,
  STAGES,
  STAGE_LABEL,
  type Lead,
  type PipelineMetrics as Metrics,
  type StageKey,
} from "@/features/02-pipeline-crm/lib/pipeline";
import { PipelineColumn } from "./PipelineColumn";
import { PipelineMetrics } from "./PipelineMetrics";
import { PipelineCardModal } from "./PipelineCardModal";
import { MoveMenu } from "./MoveMenu";

type ApiData = { leads: Lead[]; metrics: Metrics; source: "sheet" | "supabase" | "demo" };
type LoadError = { status: number; message: string };
type MenuTarget = { lead: Lead; anchor: DOMRect };

const selectClass =
  "rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--bg-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]";

const COLLAPSE_KEY = "cube.pipeline.collapsed";

export function PipelineBoard() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Which columns are folded is a per-user viewing preference, so it lives in
  // localStorage rather than the shared board record. Read lazily on first render:
  // the initial paint is the loading skeleton, which doesn't read this state, so
  // there's nothing for the server and client markup to disagree about.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(COLLAPSE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {}; // malformed or blocked storage
    }
  });

  const persistCollapsed = useCallback((next: Record<string, boolean>) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/pipeline", { cache: "no-store" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw { status: r.status, message: body.error || `Failed to load (${r.status})` } as LoadError;
      }
      setData(await r.json());
    } catch (e) {
      const le = e as LoadError;
      setError({ status: le.status ?? 0, message: le.message ?? "Failed to load pipeline" });
    }
  }, []);

  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  const sources = useMemo(() => (data ? [...new Set(data.leads.map((l) => l.source || "unknown"))].sort() : []), [data]);
  const owners = useMemo(() => (data ? [...new Set(data.leads.map((l) => l.owner || "Unassigned"))].sort() : []), [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.leads.filter((l) => {
      if (sourceFilter !== "all" && (l.source || "unknown") !== sourceFilter) return false;
      if (ownerFilter !== "all" && (l.owner || "Unassigned") !== ownerFilter) return false;
      if (q && !`${l.company} ${l.name} ${l.industry ?? ""} ${l.owner ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, sourceFilter, ownerFilter]);

  const byStage = useMemo(() => {
    const m = new Map<StageKey, Lead[]>();
    for (const l of filtered) {
      const arr = m.get(l.stage);
      if (arr) arr.push(l);
      else m.set(l.stage, [l]);
    }
    return m;
  }, [filtered]);

  /** Optimistic restage, then persist, then reconcile against the server. */
  const moveLead = useCallback(
    async (id: string, stage: StageKey) => {
      const label = STAGE_LABEL[stage];
      const lead = data?.leads.find((l) => l.id === id);
      setData((prev) => (prev ? { ...prev, leads: prev.leads.map((l) => (l.id === id ? { ...l, stage } : l)) } : prev));
      setNotice(`Moved ${lead?.company ?? "lead"} to ${label}.`);
      try {
        const r = await fetch("/api/pipeline/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, patch: { stage } }),
        });
        const j = await r.json().catch(() => ({}));
        // Demo mode accepts nothing — say so, otherwise the reload below silently
        // snaps the card back and the board looks broken.
        if (!j.ok) setNotice(j.message || j.error || "Move not saved.");
      } catch {
        setNotice("Network error — move not saved.");
      } finally {
        await reload();
      }
    },
    [data, reload]
  );

  function onDropTo(stage: StageKey) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const lead = data?.leads.find((l) => l.id === id);
    if (lead && lead.stage !== stage) moveLead(id, stage);
  }

  async function sync() {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch("/api/pipeline/import", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setNotice(`Synced: ${j.inserted} new, ${j.updated} refreshed.`);
        await reload();
      } else setNotice(j.message || j.error || "Sync failed.");
    } finally {
      setBusy(false);
    }
  }

  // Auto-dismiss transient feedback so it doesn't pile up in the toolbar.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Covers the outcome trays too, and writes an explicit `false` on expand — the
  // trays default to collapsed, so clearing the map would leave them shut.
  const allCollapsed = BOARD_STAGES.every((s) => collapsed[s.key]);
  function toggleAll() {
    persistCollapsed(Object.fromEntries(BOARD_STAGES.map((s) => [s.key, !allCollapsed])));
  }

  if (error) {
    const restricted = error.status === 403;
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
        <p className="font-display text-xl font-bold text-[var(--bg-dark)]">{restricted ? "Exec board only" : "Couldn’t load the pipeline"}</p>
        <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
          {restricted
            ? "The pipeline is restricted to the exec board. Ask an exec to set your role to exec in the member directory."
            : error.message}
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--bg-cream)]" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--bg-cream)]" />
      </div>
    );
  }

  const cardHandlers = {
    onOpen: (l: Lead) => setEditing(l),
    onMove: (lead: Lead, anchor: DOMRect) => setMenu({ lead, anchor }),
    dragId,
    onDragStart: (id: string) => setDragId(id),
    onDragEnd: () => setDragId(null),
  };

  return (
    <div className="space-y-6">
      {/* Source note + sync */}
      <div className="flex flex-wrap items-center gap-3">
        {data.source === "demo" ? (
          <div className="flex-1 rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-3 text-sm text-[var(--bg-dark)]">
            <span className="font-semibold">Demo data.</span> Configure Supabase + set{" "}
            <code className="text-[var(--gold-deep)]">PIPELINE_SHEET_ID</code> (+ credentials), then Sync. Edits won’t save
            until then. See INTEGRATION.md.
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            Click a card to edit it, or hit <span className="font-semibold text-[var(--bg-dark)]">Move</span> (or right-click)
            to send it straight to any stage. Dragging still works.
          </p>
        )}
        <div className="ml-auto flex items-center gap-3">
          <button onClick={sync} disabled={busy} className="btn btn-gold-outline text-xs px-4 py-2 disabled:opacity-50">
            {busy ? "Syncing…" : "Sync from outreach sheet"}
          </button>
        </div>
      </div>

      <PipelineMetrics metrics={data.metrics} />

      {/* Toolbar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/95 p-4 backdrop-blur">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, contact, industry, owner…"
            aria-label="Search leads"
            className="w-full rounded-full border border-[var(--border)] bg-white py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
          />
        </div>
        <select aria-label="Filter by source" className={selectClass} value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="all">All sources</option>
          {sources.map((s) => (<option key={s} value={s} className="capitalize">{s}</option>))}
        </select>
        <select aria-label="Filter by owner" className={selectClass} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="all">All owners</option>
          {owners.map((o) => (<option key={o} value={o}>{o}</option>))}
        </select>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--bg-dark)] hover:border-[var(--gold)]"
        >
          {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
        <span className="text-sm tabular-nums text-[var(--muted)]">{filtered.length} shown</span>
        {notice && (
          <span className="w-full text-sm text-[var(--gold-deep)] sm:w-auto" role="status">
            {notice}
          </span>
        )}
      </div>

      {/* Funnel */}
      <div>
        <p className="eyebrow mb-2">Funnel</p>
        {/* items-start: each lane hugs its own content instead of stretching to match
            the tallest one, which left acres of empty cream next to "Contacted". */}
        <div className="-mx-1 flex items-start gap-4 overflow-x-auto px-1 pb-4">
          {STAGES.map((stage) => (
            <PipelineColumn
              key={stage.key}
              label={stage.label}
              hint={stage.hint}
              leads={byStage.get(stage.key) ?? []}
              collapsed={Boolean(collapsed[stage.key])}
              onToggle={() => persistCollapsed({ ...collapsed, [stage.key]: !collapsed[stage.key] })}
              onDrop={() => onDropTo(stage.key)}
              {...cardHandlers}
            />
          ))}
        </div>
      </div>

      {/* Terminal outcomes — pulled out of the horizontal scroller so they're always
          reachable in one click instead of living past the right edge of the funnel. */}
      <div>
        <p className="eyebrow mb-2">Closed out</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {OUTCOME_STAGES.map((stage) => (
            <PipelineColumn
              key={stage.key}
              variant="tray"
              label={stage.label}
              hint={stage.hint}
              leads={byStage.get(stage.key) ?? []}
              // Archives default to folded — this is where the board used to sprawl.
              collapsed={collapsed[stage.key] ?? true}
              onToggle={() => persistCollapsed({ ...collapsed, [stage.key]: !(collapsed[stage.key] ?? true) })}
              onDrop={() => onDropTo(stage.key)}
              {...cardHandlers}
            />
          ))}
        </div>
      </div>

      {menu && (
        <MoveMenu
          anchor={menu.anchor}
          current={menu.lead.stage}
          onClose={() => setMenu(null)}
          onPick={(stage) => {
            setMenu(null);
            if (stage !== menu.lead.stage) moveLead(menu.lead.id, stage);
          }}
        />
      )}

      {editing && (
        <PipelineCardModal
          lead={editing}
          onClose={() => setEditing(null)}
          onMoveStage={(stage) => {
            setEditing((prev) => (prev ? { ...prev, stage } : prev));
            moveLead(editing.id, stage);
          }}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}
