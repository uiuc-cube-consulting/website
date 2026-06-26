"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { BOARD_STAGES, type Lead, type PipelineMetrics as Metrics, type StageKey } from "@/features/02-pipeline-crm/lib/pipeline";
import { LeadCard } from "./LeadCard";
import { PipelineMetrics } from "./PipelineMetrics";
import { PipelineCardModal } from "./PipelineCardModal";

type ApiData = { leads: Lead[]; metrics: Metrics; source: "sheet" | "supabase" | "demo" };
type LoadError = { status: number; message: string };

const selectClass =
  "rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--bg-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]";

export function PipelineBoard() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
      if (q && !`${l.company} ${l.name} ${l.industry ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, query, sourceFilter, ownerFilter]);

  // Drag a card to a new stage column → optimistic move, persist, then reconcile.
  async function moveLead(id: string, stage: StageKey) {
    setData((prev) => (prev ? { ...prev, leads: prev.leads.map((l) => (l.id === id ? { ...l, stage } : l)) } : prev));
    try {
      await fetch("/api/pipeline/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, patch: { stage } }),
      });
    } finally {
      await reload(); // refresh metrics + reconcile (reverts if the write failed)
    }
  }

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

  return (
    <div className="space-y-6">
      {/* Source note + sync */}
      <div className="flex flex-wrap items-center gap-3">
        {data.source === "demo" ? (
          <div className="flex-1 rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-3 text-sm text-[var(--bg-dark)]">
            <span className="font-semibold">Demo data.</span> Configure Supabase + set{" "}
            <code className="text-[var(--gold-deep)]">PIPELINE_SHEET_ID</code> (+ credentials), then Sync. See INTEGRATION.md.
          </div>
        ) : (
          <p className="text-sm text-[var(--muted)]">Drag a card between columns to change its stage. Click a card to edit it.</p>
        )}
        <div className="ml-auto flex items-center gap-3">
          {notice && <span className="text-sm text-[var(--gold-deep)]">{notice}</span>}
          <button onClick={sync} disabled={busy} className="btn btn-gold-outline text-xs px-4 py-2 disabled:opacity-50">
            {busy ? "Syncing…" : "Sync from outreach sheet"}
          </button>
        </div>
      </div>

      <PipelineMetrics metrics={data.metrics} />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-white/70 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, contact, industry…"
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
        <span className="ml-auto text-sm text-[var(--muted)]">{filtered.length} leads</span>
      </div>

      {/* Kanban */}
      <div className="-mx-1 flex gap-4 overflow-x-auto pb-4">
        {BOARD_STAGES.map((stage) => {
          const leads = filtered.filter((l) => l.stage === stage.key);
          return (
            <section
              key={stage.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDropTo(stage.key)}
              className="flex w-72 shrink-0 flex-col rounded-2xl bg-[var(--bg-cream)]/60 p-3"
            >
              <header className="flex items-center justify-between px-1 pb-2">
                <div>
                  <h3 className="font-display text-sm font-bold text-[var(--bg-dark)]">{stage.label}</h3>
                  <p className="text-[11px] text-[var(--muted)]">{stage.hint}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[var(--bg-dark)]">{leads.length}</span>
              </header>
              <div className="flex min-h-[40px] flex-col gap-2.5">
                {leads.map((l) => (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => setDragId(null)}
                    onClick={() => setEditing(l)}
                    title="Drag to move · click to edit"
                    className={`cursor-grab active:cursor-grabbing ${dragId === l.id ? "opacity-50" : ""}`}
                  >
                    <LeadCard lead={l} />
                  </div>
                ))}
                {leads.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
                    Drop here
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {editing && (
        <PipelineCardModal
          lead={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}
    </div>
  );
}
