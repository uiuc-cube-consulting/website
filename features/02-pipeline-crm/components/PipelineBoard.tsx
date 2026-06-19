"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { STAGES, type Lead, type PipelineMetrics as Metrics } from "@/features/02-pipeline-crm/lib/pipeline";
import { LeadCard } from "./LeadCard";
import { PipelineMetrics } from "./PipelineMetrics";

type ApiData = { leads: Lead[]; metrics: Metrics; source: "sheet" | "demo" };
type LoadError = { status: number; message: string };

const selectClass =
  "rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--bg-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]";

export function PipelineBoard() {
  const [data, setData] = useState<ApiData | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const sources = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.leads.map((l) => l.source || "unknown"))].sort();
  }, [data]);
  const owners = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.leads.map((l) => l.owner || "Unassigned"))].sort();
  }, [data]);

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

  if (error) {
    const restricted = error.status === 403;
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
        <p className="font-display text-xl font-bold text-[var(--bg-dark)]">
          {restricted ? "Leadership only" : "Couldn’t load the pipeline"}
        </p>
        <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
          {restricted
            ? "The pipeline is restricted to the leadership allowlist. Ask an exec to add you to PIPELINE_ALLOWLIST."
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
      {data.source === "demo" && (
        <div className="rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-3 text-sm text-[var(--bg-dark)]">
          <span className="font-semibold">Demo data.</span> Set <code className="text-[var(--gold-deep)]">PIPELINE_SHEET_ID</code>{" "}
          (+ Google credentials) to read your live outreach Sheet. See the feature INTEGRATION.md.
        </div>
      )}

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
          {sources.map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
        <select aria-label="Filter by owner" className={selectClass} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="all">All owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-[var(--muted)]">{filtered.length} leads</span>
      </div>

      {/* Kanban */}
      <div className="-mx-1 flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const leads = filtered.filter((l) => l.stage === stage.key);
          return (
            <section key={stage.key} className="flex w-72 shrink-0 flex-col rounded-2xl bg-[var(--bg-cream)]/60 p-3">
              <header className="flex items-center justify-between px-1 pb-2">
                <div>
                  <h3 className="font-display text-sm font-bold text-[var(--bg-dark)]">{stage.label}</h3>
                  <p className="text-[11px] text-[var(--muted)]">{stage.hint}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[var(--bg-dark)]">{leads.length}</span>
              </header>
              <div className="flex flex-col gap-2.5">
                {leads.map((l) => (
                  <LeadCard key={l.id} lead={l} />
                ))}
                {leads.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
                    Empty
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
