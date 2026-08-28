"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Minus, Plus, Search, Trophy } from "lucide-react";
import { withRanks, type StandingsRow } from "@/lib/points";

type Entry = {
  id: string;
  member_id: string;
  delta: number;
  reason: string;
  created_at: string;
  awarded_by_name: string | null;
};

type ApiResponse = {
  rows: StandingsRow[];
  entries?: Entry[];
  canAward?: boolean;
  ledgerMissing?: boolean;
  error?: string;
};

export function PointsLookup() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/points", { cache: "no-store" });
      if (!r.ok) throw new Error(`Failed to load (${r.status})`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  // Async fetch lives inside the IIFE, so no setState runs synchronously in the
  // effect (same pattern as RecruitingDashboard).
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const ranked = useMemo(() => (data ? withRanks(data.rows) : null), [data]);

  const filtered = useMemo(() => {
    if (!ranked) return null;
    const q = query.trim().toLowerCase();
    if (!q) return ranked;
    return ranked.filter(
      (r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
    );
  }, [ranked, query]);

  // With the whole board on zero there is no leader to crown — showing the
  // alphabetically-first member as "Leader" would be inventing a standing.
  const leader = ranked?.[0];
  const hasAnyPoints = Boolean(ranked?.some((r) => r.points !== 0));
  const canAward = data?.canAward ?? false;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
      <div className="p-5 md:p-6 border-b border-[var(--border)] flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-cream)]/30 text-sm focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2"
          />
        </div>
        {hasAnyPoints && leader ? (
          <div className="inline-flex items-center gap-2 text-sm text-[var(--bg-dark)]">
            <Trophy size={16} className="text-[var(--gold-deep)]" />
            <span className="text-[var(--muted)]">Leader:</span>
            <span className="font-semibold">{leader.name}</span>
            <span className="text-[var(--gold-deep)] font-bold">{leader.points}</span>
          </div>
        ) : (
          ranked && (
            <span className="text-sm text-[var(--muted)]">
              {ranked.length} members · everyone starts at 0
            </span>
          )
        )}
      </div>

      {data?.ledgerMissing && (
        <p className="px-5 py-3 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">
          The points table doesn&rsquo;t exist yet — run <code>db/points.sql</code> in Supabase.
          Showing the roster on zero.
        </p>
      )}

      <div className="max-h-[420px] overflow-y-auto">
        {error && <p className="p-6 text-sm text-red-700" role="alert">{error}</p>}

        {!error && data === null && (
          <ul className="divide-y divide-[var(--border)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="p-4 md:p-5 flex items-center justify-between gap-4 animate-pulse">
                <span className="h-4 w-40 rounded bg-[var(--bg-cream)]" />
                <span className="h-4 w-10 rounded bg-[var(--bg-cream)]" />
              </li>
            ))}
          </ul>
        )}

        {filtered && filtered.length === 0 && (
          <p className="p-6 text-sm text-[var(--muted)]">No members match your search.</p>
        )}

        {filtered && filtered.length > 0 && (
          <ul className="divide-y divide-[var(--border)]">
            {filtered.map((r) => {
              const theirs = (data?.entries ?? []).filter((e) => e.member_id === r.member_id);
              const open = openId === r.member_id;
              return (
                <li key={r.member_id} className="hover:bg-[var(--bg-cream)]/30">
                  <div className="px-5 md:px-6 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-xs font-bold text-[var(--gold-deep)] tabular-nums w-6 text-right">
                        {String(r.rank).padStart(2, "0")}
                      </span>
                      <span className="font-medium text-[var(--bg-dark)] truncate">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {theirs.length > 0 && (
                        <button
                          onClick={() => setOpenId(open ? null : r.member_id)}
                          className="text-[11px] text-[var(--muted)] hover:text-[var(--bg-dark)] inline-flex items-center gap-1"
                          aria-expanded={open}
                        >
                          {theirs.length} {theirs.length === 1 ? "award" : "awards"}
                          <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
                        </button>
                      )}
                      <span className="font-display font-extrabold text-[var(--bg-dark)] tabular-nums w-10 text-right">
                        {r.points}
                      </span>
                      {canAward && <AwardButton row={r} onDone={load} />}
                    </div>
                  </div>

                  {open && theirs.length > 0 && (
                    <ul className="px-5 md:px-6 pb-4 space-y-1.5">
                      {theirs.map((e) => (
                        <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
                          <span className="text-[var(--muted)]">
                            {e.reason}
                            {e.awarded_by_name && <span className="opacity-70"> · {e.awarded_by_name}</span>}
                            <span className="opacity-70">
                              {" "}· {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </span>
                          <span className={`font-semibold tabular-nums shrink-0 ${e.delta > 0 ? "text-emerald-700" : "text-red-600"}`}>
                            {e.delta > 0 ? "+" : ""}{e.delta}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Exec-only award control. Points are appended as ledger entries, so a mistake
 * is fixed with an offsetting negative entry rather than by editing a total —
 * which is why the form takes a signed amount and a required reason.
 */
function AwardButton({ row, onDone }: { row: StandingsRow; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(sign: 1 | -1) {
    const delta = sign * Math.abs(parseInt(amount, 10) || 0);
    if (!delta || !reason.trim()) {
      setErr(!delta ? "Enter an amount." : "A reason is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: row.member_id, delta, reason: reason.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not award points.");
      setDone(true);
      setReason("");
      setAmount("1");
      await onDone();
      setTimeout(() => { setDone(false); setOpen(false); }, 900);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not award points.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)] transition-colors"
        aria-label={`Award points to ${row.name}`}
        title={`Award points to ${row.name}`}
      >
        <Plus size={14} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-14 rounded-lg border border-[var(--border)] px-2 py-1 text-xs tabular-nums focus:outline-none focus:border-[var(--gold)]"
        aria-label="Amount"
      />
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-40 rounded-lg border border-[var(--border)] px-2 py-1 text-xs focus:outline-none focus:border-[var(--gold)]"
        aria-label="Reason"
      />
      <button
        onClick={() => void submit(1)}
        disabled={busy}
        className="grid place-items-center w-7 h-7 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        aria-label="Add points"
        title="Add"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : done ? <Check size={13} /> : <Plus size={13} />}
      </button>
      <button
        onClick={() => void submit(-1)}
        disabled={busy}
        className="grid place-items-center w-7 h-7 rounded-lg border border-[var(--border)] text-red-600 hover:bg-red-50 disabled:opacity-50"
        aria-label="Deduct points"
        title="Deduct"
      >
        <Minus size={13} />
      </button>
      <button
        onClick={() => { setOpen(false); setErr(null); }}
        className="text-[11px] text-[var(--muted)] hover:text-[var(--bg-dark)] px-1"
      >
        Cancel
      </button>
      {err && <span className="text-[11px] text-red-600 max-w-[10rem]">{err}</span>}
    </div>
  );
}
