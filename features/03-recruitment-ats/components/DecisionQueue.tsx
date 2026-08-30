"use client";

// Exec-only: where the WRITTEN round ends. Every candidate whose application has
// been read by both reviewers, with BOTH verdicts unblinded side by side, and the
// call that either puts them into the first round or ends their cycle.
//
// Separate component (and separate endpoint) from RecruitingDashboard on purpose.
// The dashboard is the reviewer's surface and keeps other people's scores hidden
// so the screen stays blind. This is the opposite view, for the opposite job, and
// only exec ever sees it.
//
// The later two rounds are decided in the interview console instead, next to the
// rubrics and notes that justify the call.

import { useCallback, useEffect, useState } from "react";
import { RUBRIC, SCREEN_MAX_POINTS } from "@/features/03-recruitment-ats/lib/types";
import { DISAGREEMENT_THRESHOLD, type DecisionRow, type QueueOrder, type QueueSummary } from "@/features/03-recruitment-ats/lib/decision";
import { FlagBadge } from "@/features/03-recruitment-ats/components/FlagBadge";

type ApiResponse = { rows: DecisionRow[]; summary: QueueSummary; demo: boolean; error?: string };

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied", screened: "Screened", interview: "First round",
  final_round: "Final round", offer: "Offer", accepted: "Accepted",
  rejected: "Rejected", withdrawn: "Withdrawn",
};

export function DecisionQueue() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [order, setOrder] = useState<QueueOrder>("score");
  const [readyOnly, setReadyOnly] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  // Fetch lives inside the effect with an abort signal rather than being called
  // from it: switching sort order quickly fires overlapping requests, and without
  // this the slower one can land last and paint stale rows.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          `/api/recruitment/decisions?order=${order}&ready=${readyOnly ? 1 : 0}`,
          { signal: ctrl.signal }
        );
        const json = await r.json();
        if (!ctrl.signal.aborted) setData(json);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") {
          setData({ rows: [], summary: { total: 0, ready: 0, awaitingReviews: 0, disagreements: 0, undecided: 0 }, demo: false, error: "Could not load the decision queue." });
        }
      }
    })();
    return () => ctrl.abort();
  }, [order, readyOnly, reloadKey]);

  async function decide(applicantId: string, stage: string, name: string) {
    setBusy(applicantId);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: applicantId, stage }),
      });
      const j = await r.json();
      setToast(j.ok ? `${name} → ${STAGE_LABEL[stage] ?? stage}` : j.error || "Could not update.");
      if (j.ok) reload();
    } finally {
      setBusy(null);
    }
  }

  if (!data) return <p className="text-sm text-[var(--muted)]">Loading decision queue…</p>;
  if (data.error) return <p className="text-sm text-amber-700">{data.error}</p>;

  const s = data.summary;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="eyebrow">Written round decisions</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              <span className="font-semibold text-[var(--bg-dark)]">{s.undecided}</span> ready to decide ·{" "}
              {s.awaitingReviews} still awaiting reviews
              {s.disagreements > 0 && (
                <> · <span className="font-semibold text-amber-700">{s.disagreements} contested</span></>
              )}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value as QueueOrder)}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs"
            >
              <option value="score">Highest score first</option>
              <option value="disagreement">Most contested first</option>
              <option value="name">By name</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
              <input
                type="checkbox"
                checked={readyOnly}
                onChange={(e) => setReadyOnly(e.target.checked)}
                className="accent-[var(--gold)]"
              />
              Only fully reviewed
            </label>
          </div>
        </div>
        {toast && <p className="mt-3 text-sm text-[var(--gold-deep)]">{toast}</p>}
      </div>

      {data.rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          Nothing ready yet — candidates appear here once both readers have submitted, and
          leave once you advance or reject them.
        </p>
      )}

      <div className="space-y-3">
        {data.rows.map((row) => {
          const id = row.applicant.id;
          const expanded = open === id;
          return (
            <div key={id} className="rounded-2xl border border-[var(--border)] bg-white">
              <button
                onClick={() => setOpen(expanded ? null : id)}
                className="flex w-full flex-wrap items-center gap-3 p-4 text-left"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold text-[var(--bg-dark)]">
                    <span className="truncate">{row.applicant.name}</span>
                    {/* Flags belong on THIS screen above all others: it is where
                        the call is actually made, and a flag is the evidence the
                        28-point rubric cannot express. */}
                    <FlagBadge flags={row.flags} />
                  </p>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {row.applicant.email}
                    {row.applicant.year ? ` · ${row.applicant.year}` : ""}
                    {row.applicant.major ? ` · ${row.applicant.major}` : ""}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {row.disagreement && (
                    <span
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
                      title={`The two readers differ by ${row.spread} points — at or above the ${DISAGREEMENT_THRESHOLD}-point threshold. Read the notes, not the mean.`}
                    >
                      split · {row.spread} pts apart
                    </span>
                  )}
                  {!row.ready && (
                    <span className="rounded-full bg-[var(--bg-cream)] px-2 py-0.5 text-[11px] font-semibold text-[var(--muted)]">
                      awaiting {row.awaiting}
                    </span>
                  )}
                  <span className="rounded-full bg-[var(--bg-cream)] px-2.5 py-0.5 text-xs font-semibold text-[var(--bg-dark)]">
                    {row.mean ?? "—"} / {SCREEN_MAX_POINTS}
                  </span>
                  <span className="text-xs text-[var(--muted)]">{expanded ? "▲" : "▼"}</span>
                </div>
              </button>

              {expanded && (
                <div className="border-t border-[var(--border)] p-4">
                  {/* Both verdicts, side by side. The notes are the point — for a
                      contested candidate the mean is actively misleading. */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {row.verdicts.map((v) => (
                      <div key={v.reviewer_email} className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 p-3">
                        <div className="flex items-center justify-between">
                          <p className="truncate text-xs font-semibold text-[var(--bg-dark)]">{v.reviewer_email}</p>
                          <span className="text-xs font-semibold">{v.weighted_total} / {SCREEN_MAX_POINTS}</span>
                        </div>
                        <ul className="mt-2 space-y-0.5">
                          {RUBRIC.map((c) => (
                            <li key={c.key} className="flex justify-between text-[11px] text-[var(--muted)]">
                              <span>{c.label}</span>
                              <span className="font-medium text-[var(--bg-dark)]">
                                {v.scores[c.key] ?? "—"}
                                <span className="font-normal text-[var(--muted)]">/{c.max}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                        {v.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--bg-dark)]">{v.notes}</p>}
                      </div>
                    ))}
                    {row.verdicts.length === 0 && (
                      <p className="text-xs text-[var(--muted)]">No written reviews submitted yet.</p>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => decide(id, "interview", row.applicant.name)}
                      disabled={busy === id}
                      className="btn btn-gold text-xs px-3 py-1.5 disabled:opacity-50"
                    >
                      Advance to first round
                    </button>
                    <button
                      onClick={() => decide(id, "rejected", row.applicant.name)}
                      disabled={busy === id}
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <span className="text-xs text-[var(--muted)]">
                      Currently {STAGE_LABEL[row.applicant.stage] ?? row.applicant.stage}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
