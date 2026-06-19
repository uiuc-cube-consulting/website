"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RUBRIC,
  STAGES,
  type RubricKey,
  type Scores,
  type Stage,
} from "@/features/03-recruitment-ats/lib/types";

type Row = {
  applicant: {
    id: string;
    name: string;
    email: string;
    year?: string;
    major?: string;
    college?: string;
    responses: Record<string, string>;
    stage: Stage;
  };
  reviewCount: number;
  mean: number | null;
  spread: number | null;
  perCriterion: Record<RubricKey, number | null>;
  hasReviewed: boolean;
  myReview: { scores: Scores; notes: string } | null;
};

type ApiResponse = {
  applicants: Row[];
  funnel: { stage: Stage; count: number; reached: number }[];
  demo: boolean;
  reviewer: string;
};

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied", screened: "Screened", interview: "Interview",
  offer: "Offer", accepted: "Accepted", rejected: "Rejected", withdrawn: "Withdrawn",
};

function nextStage(stage: Stage): Stage | null {
  const i = (STAGES as readonly string[]).indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function RecruitingDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/recruitment/applicants", { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  // Async fetch lives inside the IIFE, so no setState runs synchronously in the effect.
  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  const selected = useMemo(
    () => data?.applicants.find((r) => r.applicant.id === selectedId) ?? null,
    [data, selectedId]
  );

  if (error) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
        <p className="font-display text-xl font-bold text-[var(--bg-dark)]">Couldn’t load recruiting</p>
        <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <div className="h-80 animate-pulse rounded-2xl bg-[var(--bg-cream)]" />;
  }

  const needsReview = data.applicants.filter((r) => r.reviewCount < 2 && !["rejected", "withdrawn"].includes(r.applicant.stage)).length;
  const disagreements = data.applicants.filter((r) => (r.spread ?? 0) >= 1.5).length;
  const maxReached = Math.max(1, ...data.funnel.map((f) => f.reached));

  return (
    <div className="space-y-6">
      {data.demo && (
        <div className="rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-3 text-sm text-[var(--bg-dark)]">
          <span className="font-semibold">Demo data.</span> Configure Supabase (see the feature
          INTEGRATION.md) to store real applicants and reviews. Writes are disabled in demo mode.
        </div>
      )}

      {/* Analytics summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 lg:col-span-2">
          <p className="eyebrow">Funnel</p>
          <div className="mt-4 space-y-2.5">
            {data.funnel.map((f) => (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-[13px] text-[var(--bg-dark)]">{STAGE_LABEL[f.stage]}</span>
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--bg-cream)]">
                  <div className="h-full rounded-md bg-[var(--gold)]/70" style={{ width: `${Math.round((f.reached / maxReached) * 100)}%` }} />
                  <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-[var(--bg-dark)]">{f.reached}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <p className="eyebrow">Calibration</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Applicants</span><span className="font-bold text-[var(--bg-dark)]">{data.applicants.length}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Need a 2nd review</span><span className="font-bold text-[var(--bg-dark)]">{needsReview}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Reviewer disagreements</span><span className="font-bold text-[var(--bg-dark)]">{disagreements}</span></div>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">Disagreement = score spread ≥ 1.5 between reviewers.</p>
        </div>
      </div>

      {/* Queue + detail */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-[var(--border)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span>Applicant</span><span>Stage</span><span>Reviews</span><span>Mean</span>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {data.applicants.map((r) => {
                const flag = r.reviewCount < 2 && !["rejected", "withdrawn"].includes(r.applicant.stage);
                const disagree = (r.spread ?? 0) >= 1.5;
                return (
                  <li key={r.applicant.id}>
                    <button
                      onClick={() => setSelectedId(r.applicant.id)}
                      className={`grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-cream)]/40 ${selectedId === r.applicant.id ? "bg-[var(--bg-cream)]/60" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[var(--bg-dark)]">
                          {r.applicant.name}
                          {r.hasReviewed && <span className="ml-2 text-[11px] text-[var(--gold-deep)]">✓ yours</span>}
                        </span>
                        <span className="block truncate text-[12px] text-[var(--muted)]">{r.applicant.year} · {r.applicant.major}</span>
                      </span>
                      <span className="rounded-full bg-[var(--bg-cream)] px-2 py-0.5 text-[11px] text-[var(--bg-dark)]">{STAGE_LABEL[r.applicant.stage]}</span>
                      <span className={`text-sm tabular-nums ${flag ? "font-bold text-amber-700" : "text-[var(--muted)]"}`}>{r.reviewCount}{flag ? "!" : ""}</span>
                      <span className={`w-10 text-right text-sm font-semibold tabular-nums ${disagree ? "text-amber-700" : "text-[var(--bg-dark)]"}`}>{r.mean ?? "—"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="lg:col-span-2">
          {selected ? (
            // key → remounts (and resets local scorer state) when the selection changes.
            <ReviewPanel key={selected.applicant.id} row={selected} onChanged={reload} />
          ) : (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-[var(--border)] bg-white/60 p-8 text-center text-[var(--muted)]">
              Select an applicant to review.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewPanel({ row, onChanged }: { row: Row; onChanged: () => Promise<void> | void }) {
  const a = row.applicant;
  const [scores, setScores] = useState<Partial<Scores>>(row.myReview?.scores ?? {});
  const [notes, setNotes] = useState(row.myReview?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const scoreComplete = RUBRIC.every((c) => Number(scores[c.key]) >= 1);

  async function submitReview() {
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: a.id, scores, notes }),
      });
      const res = await r.json();
      if (res.ok) { setToast("Review saved."); await onChanged(); }
      else setToast(res.message || res.error || "Could not save review.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(stage: Stage) {
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: a.id, stage }),
      });
      const res = await r.json();
      if (res.ok) { setToast(`Moved to ${STAGE_LABEL[stage]}.`); await onChanged(); }
      else setToast(res.message || res.error || "Could not update stage.");
    } finally {
      setBusy(false);
    }
  }

  const advance = nextStage(a.stage);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <h3 className="font-display text-xl font-extrabold text-[var(--bg-dark)]">{a.name}</h3>
      <p className="text-sm text-[var(--muted)]">{a.email}</p>
      <p className="mt-1 text-sm text-[var(--bg-dark)]">{a.year} · {a.major} · {a.college}</p>

      {Object.entries(a.responses).map(([k, v]) =>
        v ? (
          <div key={k} className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{k}</p>
            <p className="text-sm text-[var(--bg-dark)]">{v}</p>
          </div>
        ) : null
      )}

      <hr className="my-4 border-[var(--border)]" />
      <p className="eyebrow">Your rubric (1–5)</p>
      <div className="mt-3 space-y-3">
        {RUBRIC.map((c) => (
          <div key={c.key}>
            <span className="text-sm font-medium text-[var(--bg-dark)]">{c.label}</span>
            <p className="text-[11px] text-[var(--muted)]">{c.anchor}</p>
            <div className="mt-1.5 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold ${Number(scores[c.key]) === n ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--bg-dark)]" : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--gold)]"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes (optional)"
        className="mt-3 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
      />
      <button onClick={submitReview} disabled={busy || !scoreComplete} className="btn btn-gold mt-3 w-full disabled:opacity-50">
        {row.hasReviewed ? "Update review" : "Submit review"}
      </button>

      <hr className="my-4 border-[var(--border)]" />
      <p className="eyebrow">Decision</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {advance && (
          <button onClick={() => decide(advance)} disabled={busy} className="btn btn-gold-outline text-xs px-3 py-1.5">
            Advance → {STAGE_LABEL[advance]}
          </button>
        )}
        {a.stage !== "rejected" && (
          <button onClick={() => decide("rejected")} disabled={busy} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
            Reject
          </button>
        )}
      </div>
      {toast && <p className="mt-3 text-sm text-[var(--gold-deep)]">{toast}</p>}
    </div>
  );
}
