"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, Minus, Plus, Search, Trophy, X } from "lucide-react";
import { withRanks, type StandingsRow } from "@/lib/points";
import { POINT_CATEGORIES, categoryLabel, cohortFor, type PointCategory } from "@/lib/point-catalog";

type Entry = {
  id: string;
  member_id: string;
  delta: number;
  reason: string;
  category: PointCategory | null;
  created_at: string;
  awarded_by_name: string | null;
};

type ApiResponse = {
  rows: StandingsRow[];
  entries?: Entry[];
  canAward?: boolean;
  ledgerMissing?: boolean;
  categoriesMissing?: boolean;
  error?: string;
};

const SHORT_LABELS: Record<PointCategory, string> = {
  fundamentals: "Fund.",
  professional: "Prof.",
  social: "Social",
};

export function PointsLookup() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [awardingId, setAwardingId] = useState<string | null>(null);

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
      {canAward && data?.categoriesMissing && !data.ledgerMissing && (
        <p className="px-5 py-3 text-sm text-amber-800 bg-amber-50 border-b border-amber-200">
          Point categories aren&rsquo;t set up yet — run <code>db/point-categories.sql</code> in Supabase.
          Awarding is paused until then so no points land without a category.
        </p>
      )}

      <div className="max-h-[520px] overflow-y-auto">
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
          <>
            {/* Column headings line up with the fixed-width cells on the right of
                each row. Below `sm` the breakdown moves under the name instead. */}
            <div className="hidden sm:flex sticky top-0 z-10 bg-white border-b border-[var(--border)] px-5 md:px-6 py-2 items-center justify-between gap-4 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span className="pl-10">Member</span>
              <div className="flex items-center gap-3">
                {POINT_CATEGORIES.map((c) => (
                  <span key={c.key} title={c.label} className="w-14 text-center">
                    {SHORT_LABELS[c.key]}
                  </span>
                ))}
                <span className="w-10 text-right">Total</span>
                {canAward && <span className="w-7" aria-hidden />}
              </div>
            </div>

            <ul className="divide-y divide-[var(--border)]">
              {filtered.map((r) => {
                const theirs = (data?.entries ?? []).filter((e) => e.member_id === r.member_id);
                const open = openId === r.member_id;
                const awarding = awardingId === r.member_id;
                const cohort = cohortFor(r.role);
                return (
                  <li key={r.member_id} className="hover:bg-[var(--bg-cream)]/30">
                    <div className="px-5 md:px-6 py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-xs font-bold text-[var(--gold-deep)] tabular-nums w-6 text-right shrink-0">
                          {String(r.rank).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-[var(--bg-dark)] truncate">{r.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--muted)]">
                            <span className="sm:hidden tabular-nums">
                              {POINT_CATEGORIES.map((c) => `${SHORT_LABELS[c.key]} ${r.categories[c.key]}`).join(" · ")}
                            </span>
                            {r.uncategorized !== 0 && (
                              <span className="tabular-nums">{r.uncategorized} uncategorized</span>
                            )}
                            {theirs.length > 0 && (
                              <button
                                onClick={() => setOpenId(open ? null : r.member_id)}
                                className="hover:text-[var(--bg-dark)] inline-flex items-center gap-1"
                                aria-expanded={open}
                              >
                                {theirs.length} {theirs.length === 1 ? "award" : "awards"}
                                <ChevronDown size={12} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {POINT_CATEGORIES.map((c) => {
                          const value = r.categories[c.key];
                          const required = c.required[cohort];
                          const met = value >= required;
                          return (
                            <span
                              key={c.key}
                              title={`${c.label}: ${value} of ${required} required`}
                              className={`hidden sm:block w-14 text-center text-sm tabular-nums ${
                                met ? "font-semibold text-emerald-700" : "text-[var(--bg-dark)]"
                              }`}
                            >
                              {value}
                            </span>
                          );
                        })}
                        <span className="font-display font-extrabold text-[var(--bg-dark)] tabular-nums w-10 text-right">
                          {r.points}
                        </span>
                        {canAward && (
                          <button
                            onClick={() => setAwardingId(awarding ? null : r.member_id)}
                            aria-expanded={awarding}
                            aria-label={awarding ? `Close award form for ${r.name}` : `Award points to ${r.name}`}
                            title={awarding ? "Close" : `Award points to ${r.name}`}
                            className={`grid place-items-center w-7 h-7 rounded-lg border transition-colors ${
                              awarding
                                ? "border-[var(--gold)] text-[var(--gold-deep)]"
                                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)] hover:text-[var(--gold-deep)]"
                            }`}
                          >
                            {awarding ? <X size={14} /> : <Plus size={14} />}
                          </button>
                        )}
                      </div>
                    </div>

                    {awarding && (
                      <AwardPanel row={r} onDone={load} disabled={Boolean(data?.categoriesMissing)} />
                    )}

                    {open && theirs.length > 0 && (
                      <ul className="px-5 md:px-6 pb-4 space-y-1.5">
                        {theirs.map((e) => (
                          <li key={e.id} className="flex items-start justify-between gap-3 text-xs">
                            <span className="text-[var(--muted)]">
                              <span className="font-medium text-[var(--bg-dark)]">
                                {e.category ? categoryLabel(e.category) : "Uncategorized"}
                              </span>
                              {" · "}
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
          </>
        )}
      </div>

      {filtered && filtered.length > 0 && (
        <p className="px-5 md:px-6 py-3 border-t border-[var(--border)] text-[11px] text-[var(--muted)]">
          A category turns green once the member meets its requirement: new members{" "}
          {POINT_CATEGORIES.map((c) => c.required.new).join(" / ")}, returning members{" "}
          {POINT_CATEGORIES.map((c) => c.required.returning).join(" / ")} (fundamentals / professional / social).
        </p>
      )}
    </div>
  );
}

/**
 * Exec-only award form for one member. Every award goes into a category, so a
 * member's fundamentals / professional / social totals are always the sum of
 * explained entries, and a mistake is fixed with an offsetting deduction in the
 * same category rather than by editing a total. It stays open after saving so
 * exec can score several categories for one person in a row.
 */
function AwardPanel({
  row,
  onDone,
  disabled,
}: {
  row: StandingsRow;
  onDone: () => Promise<void>;
  disabled: boolean;
}) {
  const [category, setCategory] = useState<PointCategory | null>(null);
  const [amount, setAmount] = useState("1");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(sign: 1 | -1) {
    const delta = sign * Math.abs(parseInt(amount, 10) || 0);
    setDone(null);
    if (!category) {
      setErr("Pick a category.");
      return;
    }
    if (!delta) {
      setErr("Enter an amount.");
      return;
    }
    if (!reason.trim()) {
      setErr("A reason is required.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member_id: row.member_id, delta, reason: reason.trim(), category }),
      });
      const j: { error?: string } = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Could not award points.");
      setDone(`${delta > 0 ? "+" : ""}${delta} ${categoryLabel(category)} for ${row.name}.`);
      setReason("");
      setAmount("1");
      await onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not award points.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-5 md:mx-6 mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 p-4 space-y-3">
      <div role="group" aria-label="Category" className="flex flex-wrap items-center gap-2">
        {POINT_CATEGORIES.map((c) => {
          const active = category === c.key;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => setCategory(c.key)}
              className={`rounded-full px-3 py-1 text-xs border transition-colors ${
                active
                  ? "bg-[var(--bg-dark)] text-white border-[var(--bg-dark)]"
                  : "bg-white border-[var(--border)] text-[var(--bg-dark)] hover:border-[var(--gold)]"
              }`}
            >
              {c.label}{" "}
              <span className={`tabular-nums ${active ? "text-white/70" : "text-[var(--muted)]"}`}>
                {row.categories[c.key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount"
          className="w-16 rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-[var(--gold)]"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required)"
          aria-label="Reason"
          className="flex-1 min-w-[10rem] rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm focus:outline-none focus:border-[var(--gold)]"
        />
        <button
          onClick={() => void submit(1)}
          disabled={busy || disabled}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 text-white text-sm px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Add
        </button>
        <button
          onClick={() => void submit(-1)}
          disabled={busy || disabled}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-white text-red-600 text-sm px-3 py-1.5 hover:bg-red-50 disabled:opacity-50"
        >
          <Minus size={13} />
          Deduct
        </button>
      </div>

      {err && (
        <p role="alert" className="text-xs text-red-600">
          {err}
        </p>
      )}
      {done && (
        <p role="status" className="text-xs text-emerald-700 inline-flex items-center gap-1">
          <Check size={12} /> {done}
        </p>
      )}
    </div>
  );
}
