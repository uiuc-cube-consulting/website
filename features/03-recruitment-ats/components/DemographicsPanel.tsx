"use client";

// EXEC-ONLY: the cohort split by pronouns, and how each group moves through the
// pipeline.
//
// Deliberately shows the STAGE SPLIT next to the headline counts. A single
// percentage tells you what the applicant pool looked like; the difference
// between that percentage at "applied" and at "interview" tells you what the
// process did with it, which is the only part anyone can act on.

import { useEffect, useState } from "react";
import {
  type DemographicsReport,
} from "@/features/03-recruitment-ats/lib/demographics";
import { SCREEN_MAX_POINTS } from "@/features/03-recruitment-ats/lib/types";

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied", screened: "Screened", interview: "First round",
  final_round: "Final round", offer: "Offer", accepted: "Accepted",
  rejected: "Rejected", withdrawn: "Withdrawn",
};

type Api = DemographicsReport & { cycle: string; demo: boolean; error?: string };

export function DemographicsPanel() {
  const [data, setData] = useState<Api | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/recruitment/demographics", { signal: ctrl.signal, cache: "no-store" });
        const j = await r.json();
        if (ctrl.signal.aborted) return;
        if (!r.ok) setError(j.error || "Could not load demographics.");
        else setData(j);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setError("Could not load demographics.");
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (error) return <p className="text-sm text-amber-700">{error}</p>;
  if (!data) return <p className="text-sm text-[var(--muted)]">Loading demographics…</p>;
  if (!data.total) return <p className="text-sm text-[var(--muted)]">No applicants in this cycle yet.</p>;

  const maxCount = Math.max(1, ...data.groups.map((g) => g.count));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <p className="eyebrow">Who applied</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {data.total} applicants, by the pronouns they gave on the form.
        </p>

        <div className="mt-4 space-y-3">
          {data.groups.map((g) => (
            <div key={g.group} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-[13px] text-[var(--bg-dark)]">{g.label}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--bg-cream)]">
                <span
                  className="block h-full rounded-full bg-[var(--gold)]"
                  style={{ width: `${(g.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="w-24 shrink-0 text-right text-[13px] tabular-nums text-[var(--bg-dark)]">
                {g.count} · {g.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* The part that actually matters. Percentages are WITHIN each stage, so a
          column reads as "of the people at this stage, what share was each
          group" — which is the comparison that shows whether the process is
          moving groups through at different rates. Counts alone cannot show
          that, because the groups are different sizes to begin with. */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <p className="eyebrow">How each group moved</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Share of each stage. Compare a group&rsquo;s column across stages — a share that
          drops as the pipeline narrows is worth understanding.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th className="py-2 pr-3 font-semibold">Stage</th>
                {data.groups.map((g) => (
                  <th key={g.group} className="py-2 pr-3 font-semibold">{g.label}</th>
                ))}
                <th className="py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.stages.map((stage) => {
                const total = data.groups.reduce((n, g) => n + (g.byStage[stage] ?? 0), 0);
                return (
                  <tr key={stage} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="py-2 pr-3 text-[var(--bg-dark)]">{STAGE_LABEL[stage] ?? stage}</td>
                    {data.groups.map((g) => {
                      const n = g.byStage[stage] ?? 0;
                      return (
                        <td key={g.group} className="py-2 pr-3 tabular-nums text-[var(--bg-dark)]">
                          {n}
                          {total > 0 && (
                            <span className="ml-1 text-[11px] text-[var(--muted)]">
                              {Math.round((n / total) * 100)}%
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 tabular-nums text-[var(--muted)]">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <p className="eyebrow">Mean written score</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Averaged per person out of {SCREEN_MAX_POINTS}, so a candidate read three times
          does not count for more than one read twice.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          {data.groups.map((g) => (
            <div key={g.group} className="rounded-xl bg-[var(--bg-cream)]/50 px-4 py-2">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{g.label}</p>
              <p className="text-lg font-semibold tabular-nums text-[var(--bg-dark)]">
                {g.meanScore ?? "—"}
                <span className="text-xs font-normal text-[var(--muted)]"> / {SCREEN_MAX_POINTS}</span>
              </p>
              <p className="text-[11px] text-[var(--muted)]">{g.reviewed} reviewed</p>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--muted)]">
        Pronouns are what the form collects, and what people chose to write. They are a proxy
        for gender, not the same thing, and small groups can identify individuals — which is why
        this page is exec-only.
      </p>
    </div>
  );
}
