"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Trophy } from "lucide-react";

type Row = { name: string; points: number };

export function PointsLookup() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/points", { cache: "no-store" });
        if (!r.ok) throw new Error(`Failed to load (${r.status})`);
        const data = await r.json();
        setRows(data.rows ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, query]);

  const top = rows?.[0];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
      <div className="p-5 md:p-6 border-b border-[var(--border)] flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-full border border-[var(--border)] bg-[var(--bg-cream)]/30 text-sm focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2"
          />
        </div>
        {top && (
          <div className="inline-flex items-center gap-2 text-sm text-[var(--bg-dark)]">
            <Trophy size={16} className="text-[var(--gold-deep)]" />
            <span className="text-[var(--muted)]">Leader:</span>
            <span className="font-semibold">{top.name}</span>
            <span className="text-[var(--gold-deep)] font-bold">{top.points}</span>
          </div>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {error && (
          <p className="p-6 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {!error && rows === null && (
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
          <ol className="divide-y divide-[var(--border)]">
            {filtered.map((r, i) => (
              <li
                key={r.name}
                className="px-5 md:px-6 py-4 flex items-center justify-between gap-4 hover:bg-[var(--bg-cream)]/30"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="text-xs font-bold text-[var(--gold-deep)] tabular-nums w-6 text-right">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-medium text-[var(--bg-dark)] truncate">{r.name}</span>
                </div>
                <span className="font-display font-extrabold text-[var(--bg-dark)] tabular-nums">
                  {r.points}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
