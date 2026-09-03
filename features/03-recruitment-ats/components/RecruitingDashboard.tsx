"use client";

// The WRITTEN round's console: the imported form responses, the resume, and the
// 28-point rubric that scores them.
//
// Applicants who have moved on stay reachable here — any member may look somebody
// up and flag them — but they are filtered out by default and cannot be re-scored.
// The later rounds are worked in /portal/interview instead.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RUBRIC,
  SCREEN_MAX_POINTS,
  STAGES,
  isScreenComplete,
  screenTotal,
  wasFiledBeforeApplying,
  type Flag,
  type RubricKey,
  type Scores,
  type Stage,
} from "@/features/03-recruitment-ats/lib/types";
import {
  MIN_REVIEWERS_PER_APPLICANT,
  resolveReviewerPool,
} from "@/features/03-recruitment-ats/lib/assignment";
import { DISAGREEMENT_THRESHOLD, type DecisionRow } from "@/features/03-recruitment-ats/lib/decision";
import { type Round } from "@/features/03-recruitment-ats/lib/rounds";
import { FlagBadge } from "@/features/03-recruitment-ats/components/FlagBadge";
import { VerdictCards } from "@/features/03-recruitment-ats/components/VerdictCards";

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
  /** null once they are past the rounds entirely (offer/accepted/rejected). */
  round: Round | null;
  hasReviewed: boolean;
  assignedToMe: boolean;
  myReview: { scores: Scores; notes: string } | null;
  flags: Flag[];
  assignedReviewers: string[];
  reviewedBy: string[];
  outstanding: string[];
  underAssigned: boolean;
  underReviewed: boolean;
};

type CoverageSummary = {
  total: number;
  fullyAssigned: number;
  fullyReviewed: number;
  underAssigned: { applicant_id: string; name: string; assigned: string[] }[];
  underReviewed: { applicant_id: string; name: string; reviewed: string[] }[];
};

type ApiResponse = {
  applicants: Row[];
  funnel: { stage: Stage; count: number; reached: number }[];
  demo: boolean;
  reviewer: string;
  progress: { assigned: number; reviewed: number; pending: number };
  hasAssignments: boolean;
  canManage: boolean;
  /** The rubric ceiling (28), sent so the header can't drift from the server. */
  maxPoints: number;
  coverage: CoverageSummary;
};

// Imported, not re-declared: this was previously a hand-kept copy of
// MIN_REVIEWERS_PER_APPLICANT, and lib/assignment.ts is pure and safe here.
const MIN_REVIEWERS = MIN_REVIEWERS_PER_APPLICANT;

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied", screened: "Screened", interview: "First round",
  final_round: "Final round", offer: "Offer", accepted: "Accepted",
  rejected: "Rejected", withdrawn: "Withdrawn",
};

/** Every stage a candidate can be moved to, forward or back. `rejected` and
 *  `withdrawn` are not in STAGES — they are exits, not steps — so they are
 *  appended explicitly rather than being silently unreachable from the picker. */
const ALL_STAGES: Stage[] = [...STAGES, "rejected", "withdrawn"];

/** Out of the running: hidden from the written round, and not re-scorable until
 *  reopened. `accepted` is excluded — that is a finished success, not something
 *  anyone needs an "undo" button for on this screen. */
function isTerminalStage(stage: Stage): boolean {
  return stage === "rejected" || stage === "withdrawn";
}

function nextStage(stage: Stage): Stage | null {
  const i = (STAGES as readonly string[]).indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function RecruitingDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queueMode, setQueueMode] = useState<"all" | "mine">("all");
  // The written round is this console's job, so it is what the list shows. "All"
  // stays available because any member may look up and flag anybody, including
  // people already in interviews.
  const [roundFilter, setRoundFilter] = useState<"written" | "all">("written");
  // Find one person, or everyone at one stage. At 300+ applicants the list is no
  // longer scannable, and "who has been screened?" is a question people ask
  // constantly — both filters run on data already loaded, so they are instant.
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<Stage | "all">("all");
  // Review progress is a SEPARATE axis from stage, and conflating them is the
  // easy mistake: a candidate sits at `applied` until exec advances them, so
  // "has two people read this?" and "what stage are they at?" answer different
  // questions and can disagree for weeks. Both filters are needed because both
  // questions get asked — "who still needs a read" and "who is ready to decide".
  const [reviewFilter, setReviewFilter] = useState<"all" | "none" | "partial" | "full">("all");
  // Bulk decisions (exec only). Ids rather than rows, so a selection survives
  // the list being re-filtered or reloaded underneath it.
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [linkingResumes, setLinkingResumes] = useState(false);
  const [managing, setManaging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [importUrl, setImportUrl] = useState("");
  // Reviewer pool picker (exec only). `selectedReviewers === null` means "not
  // narrowed" → the whole eligible pool, which is the default and the original
  // behaviour. An empty Set is a real, deliberate state (everyone unticked) and
  // must stay distinguishable from it.
  const [pool, setPool] = useState<{ email: string; name?: string | null }[] | null>(null);
  const [selectedReviewers, setSelectedReviewers] = useState<Set<string> | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);

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

  // The reviewer roster, for the exec-only picker. Endpoint is exec-gated, so
  // this is only fetched when the exec controls are actually shown.
  const canManage = data?.canManage ?? false;
  useEffect(() => {
    if (!canManage || pool !== null) return;
    let alive = true;
    fetch("/api/recruitment/reviewers")
      .then((r) => (r.ok ? r.json() : { reviewers: [] }))
      .then((j) => { if (alive) setPool(j.reviewers ?? []); })
      .catch(() => { if (alive) setPool([]); });
    return () => { alive = false; };
  }, [canManage, pool]);

  // One validation for both the warning and the button's disabled state.
  //
  // The empty-Set case is called out explicitly: `resolveReviewerPool` treats an
  // empty list as "not narrowed" (correct on the wire, where the client omits
  // the field entirely), so submitting a literal [] would assign to the WHOLE
  // pool — the exact opposite of unticking everyone. It never reaches the
  // server: the button is disabled and assignReviewers() refuses.
  const poolError: string | undefined =
    selectedReviewers === null
      ? undefined
      : selectedReviewers.size === 0
        ? `Nobody is ticked. Select at least ${MIN_REVIEWERS} reviewers, or press All.`
        : resolveReviewerPool(
            (pool ?? []).map((p) => p.email),
            [...selectedReviewers],
            MIN_REVIEWERS
          ).error;

  /**
   * Apply one decision to everything ticked.
   *
   * Confirmed by NAME, not by count. "Reject 40 applicants?" is a number nobody
   * can check; a list is something a human can actually scan for the one they
   * did not mean to tick. Rejection is reversible now, but reversing forty is
   * still worse than not sending them.
   */
  async function bulkDecide(stage: Stage) {
    const ids = [...bulkSelected];
    if (!ids.length) return;

    const names = (data?.applicants ?? [])
      .filter((r) => bulkSelected.has(r.applicant.id))
      .map((r) => r.applicant.name);
    const preview = names.slice(0, 12).join(", ") + (names.length > 12 ? `, and ${names.length - 12} more` : "");
    if (!window.confirm(`Move ${ids.length} to ${STAGE_LABEL[stage]}?\n\n${preview}`)) return;

    setBulkBusy(true);
    setNotice(null);
    try {
      const r = await fetch("/api/recruitment/decisions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_ids: ids, stage }),
      });
      const j = await r.json();
      if (!j.ok) {
        setNotice(j.error || j.message || "Could not apply that decision.");
        return;
      }
      const extra = [
        j.skippedSelf ? `${j.skippedSelf} skipped (your own application)` : "",
        j.notFound ? `${j.notFound} no longer existed` : "",
      ].filter(Boolean).join(", ");
      setNotice(`Moved ${j.updated} to ${STAGE_LABEL[stage]}.${extra ? ` ${extra}.` : ""}`);
      setBulkSelected(new Set());
      await reload();
    } catch {
      setNotice("Could not apply that decision.");
    } finally {
      setBulkBusy(false);
    }
  }

  /**
   * Fill in resumes for anyone who has none, from their Form upload.
   *
   * Reports every bucket rather than just the successes: "Linked 0" alone reads
   * as a broken button, when the honest answer is almost always "nobody was
   * missing one" or "those candidates never uploaded a file". A reviewer who
   * presses this and sees nothing happen needs to know which.
   */
  async function linkResumes() {
    setLinkingResumes(true);
    setNotice(null);
    try {
      const r = await fetch("/api/recruitment/resumes/link", { method: "POST" });
      const j = await r.json();
      if (!j.ok) {
        setNotice(j.error || j.message || "Could not link resumes.");
        return;
      }
      if (!j.missing) {
        setNotice("Every candidate already has a resume.");
      } else {
        const detail = [
          j.noLink ? `${j.noLink} uploaded no file` : "",
          j.notInSheet ? `${j.notInSheet} not in the response sheet` : "",
          j.unreadable ? `${j.unreadable} unreadable in Drive` : "",
        ].filter(Boolean).join(", ");
        setNotice(
          `Linked ${j.linked} of ${j.missing} missing.${detail ? ` Remaining: ${detail}.` : ""}`
        );
      }
      await reload();
    } catch {
      setNotice("Could not link resumes.");
    } finally {
      setLinkingResumes(false);
    }
  }

  // Exec-only: randomly assign reviewers across all active applicants.
  // `reshuffle` re-deals from scratch instead of topping up the current spread.
  async function assignReviewers(reshuffle = false) {
    if (poolError) {
      setNotice(poolError);
      return;
    }
    setManaging(true);
    setNotice(null);
    try {
      const r = await fetch("/api/recruitment/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          k: 2,
          ...(reshuffle ? { reshuffle: true } : {}),
          // Omitted entirely when not narrowed, so the server keeps its
          // whole-pool default rather than receiving a list that happens to
          // contain everyone. `.size > 0` matters: an empty Set is truthy, and
          // sending [] would read as "not narrowed" and assign to everyone.
          ...(selectedReviewers && selectedReviewers.size > 0
            ? { reviewer_emails: [...selectedReviewers] }
            : {}),
        }),
      });
      const j = await r.json();
      if (j.ok) {
        const dropped = j.ignored?.length ? ` ${j.ignored.length} ignored (not in the pool).` : "";
        const kept = j.preserved ? ` Kept ${j.preserved} already reviewed.` : "";
        setNotice(
          j.reshuffled
            ? `Reshuffled: cleared ${j.cleared} and dealt ${j.assigned} new slots across ${j.applicants} applicants (${j.reviewers} reviewers).${kept}${dropped}`
            : `Assigned ${j.assigned} review slots across ${j.applicants} applicants (${j.reviewers} reviewers).${dropped}`
        );
        await reload();
      } else setNotice(j.message || j.error || "Could not assign reviewers.");
    } finally {
      setManaging(false);
    }
  }

  // Exec-only: import applicants from a Google Sheet of form responses.
  async function importSheet() {
    if (!importUrl.trim()) return;
    setManaging(true);
    setNotice(null);
    try {
      const r = await fetch("/api/recruitment/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: importUrl.trim() }),
      });
      const j = await r.json();
      if (j.ok) {
        // Resumes are reported because the rubric scores one: an import that
        // linked none is an import whose "Resume /5" row nobody can fill in.
        const resumes = j.resumesLinked ? ` Linked ${j.resumesLinked} resume(s).` : "";
        setNotice(
          `Imported ${j.inserted} new applicant(s); skipped ${j.skipped} duplicate(s).${resumes}`
        );
        setImportUrl("");
        await reload();
      } else setNotice(j.message || j.error || "Could not import.");
    } finally {
      setManaging(false);
    }
  }

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

  const written = data.applicants.filter((r) => r.round === "written");
  const needsReview = written.filter((r) => r.reviewCount < MIN_REVIEWERS).length;
  const disagreements = data.applicants.filter((r) => (r.spread ?? 0) >= DISAGREEMENT_THRESHOLD).length;
  const maxReached = Math.max(1, ...data.funnel.map((f) => f.reached));
  // Stage counts come from whatever the round toggle is showing, so the numbers
  // in the dropdown always match the list you are looking at rather than the
  // whole cohort. Counted BEFORE the stage filter is applied — otherwise picking
  // "Screened" would rewrite every other option's count to zero.
  const inRound = roundFilter === "written" ? written : data.applicants;
  const stageCounts = new Map<string, number>();
  for (const r of inRound) stageCounts.set(r.applicant.stage, (stageCounts.get(r.applicant.stage) ?? 0) + 1);

  const reviewCounts = {
    none: inRound.filter((r) => r.reviewCount === 0).length,
    partial: inRound.filter((r) => r.reviewCount > 0 && r.reviewCount < MIN_REVIEWERS).length,
    full: inRound.filter((r) => r.reviewCount >= MIN_REVIEWERS).length,
  };

  const q = query.trim().toLowerCase();
  const visible = inRound.filter((r) => {
    if (queueMode === "mine" && !r.assignedToMe) return false;
    if (stageFilter !== "all" && r.applicant.stage !== stageFilter) return false;
    if (reviewFilter === "none" && r.reviewCount !== 0) return false;
    if (reviewFilter === "partial" && !(r.reviewCount > 0 && r.reviewCount < MIN_REVIEWERS)) return false;
    if (reviewFilter === "full" && r.reviewCount < MIN_REVIEWERS) return false;
    if (!q) return true;
    // Name and email both, because you look someone up by whichever you have —
    // a name from a conversation, an address from an email thread.
    return (
      r.applicant.name.toLowerCase().includes(q) || r.applicant.email.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {data.demo && (
        <div className="rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-3 text-sm text-[var(--bg-dark)]">
          <span className="font-semibold">Demo data.</span> Configure Supabase (see the feature
          INTEGRATION.md) to store real applicants and reviews. Writes are disabled in demo mode.
        </div>
      )}

      {/* Exec controls: import applicants from a sheet + randomly assign reviewers */}
      {data.canManage && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
          <button
            onClick={() => void assignReviewers(false)}
            disabled={managing || Boolean(poolError)}
            title={poolError}
            className="btn btn-gold text-xs px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {managing
              ? "Working…"
              : selectedReviewers
                ? `Assign reviewers (${selectedReviewers.size} selected)`
                : "Assign reviewers (random)"}
          </button>
          <button
            onClick={() => setPoolOpen((o) => !o)}
            className="btn btn-gold-outline text-xs px-4 py-2"
            aria-expanded={poolOpen}
          >
            {poolOpen ? "Hide reviewers" : "Choose reviewers"}
          </button>
          <ReshuffleButton
            disabled={managing || Boolean(poolError)}
            busy={managing}
            onConfirm={() => assignReviewers(true)}
          />
          <div className="flex items-center gap-2">
            <input
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="Paste a Google Sheet URL to import applicants"
              className="w-72 max-w-full rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            />
            <button onClick={importSheet} disabled={managing || !importUrl.trim()} className="btn btn-gold-outline text-xs px-4 py-2 disabled:opacity-50">
              Import
            </button>
          </div>
          {notice && <span className="text-sm text-[var(--gold-deep)]">{notice}</span>}

          {poolOpen && (
            <ReviewerPoolPicker
              pool={pool}
              selected={selectedReviewers}
              onChange={setSelectedReviewers}
              error={poolError}
            />
          )}
        </div>
      )}

      {/* Coverage: who is short of the two-reviewer minimum. Shown to every
          reviewer, not just exec — the fastest way to close a gap is for the
          people who owe reviews to see that they owe them. */}
      {data.coverage && (data.coverage.underAssigned.length > 0 || data.coverage.underReviewed.length > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-sm font-semibold text-amber-900">
            Written applications need {MIN_REVIEWERS} independent reads
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {data.coverage.underAssigned.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-800">
                  {data.coverage.underAssigned.length} short of {MIN_REVIEWERS} reviewers assigned
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-900/80">
                  {data.coverage.underAssigned.slice(0, 8).map((c) => (
                    <li key={c.applicant_id}>
                      {c.name} <span className="opacity-70">({c.assigned.length} assigned)</span>
                    </li>
                  ))}
                  {data.coverage.underAssigned.length > 8 && (
                    <li className="opacity-70">…and {data.coverage.underAssigned.length - 8} more</li>
                  )}
                </ul>
                {data.canManage && (
                  <p className="mt-1 text-xs text-amber-800">
                    Run <span className="font-medium">Assign reviewers</span> to top these up.
                  </p>
                )}
              </div>
            )}
            {data.coverage.underReviewed.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-800">
                  {data.coverage.underReviewed.length} still awaiting {MIN_REVIEWERS} submitted reviews
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-amber-900/80">
                  {data.coverage.underReviewed.slice(0, 8).map((c) => (
                    <li key={c.applicant_id}>
                      {c.name} <span className="opacity-70">({c.reviewed.length} in)</span>
                    </li>
                  ))}
                  {data.coverage.underReviewed.length > 8 && (
                    <li className="opacity-70">…and {data.coverage.underReviewed.length - 8} more</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reviewer queue toggle + progress */}
      {data.hasAssignments && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="inline-flex overflow-hidden rounded-full border border-[var(--border)]">
            <button
              onClick={() => setQueueMode("mine")}
              className={`px-4 py-1.5 text-sm font-medium ${queueMode === "mine" ? "bg-[var(--gold)] text-[var(--bg-dark)]" : "bg-white text-[var(--bg-dark)]"}`}
            >
              My queue ({data.progress.assigned})
            </button>
            <button
              onClick={() => setQueueMode("all")}
              className={`px-4 py-1.5 text-sm font-medium ${queueMode === "all" ? "bg-[var(--gold)] text-[var(--bg-dark)]" : "bg-white text-[var(--bg-dark)]"}`}
            >
              All ({data.applicants.length})
            </button>
          </div>
          {data.progress.assigned > 0 && (
            <span className="text-sm text-[var(--muted)]">
              Reviewed <span className="font-semibold text-[var(--bg-dark)]">{data.progress.reviewed}</span> / {data.progress.assigned}
              {data.progress.pending > 0 && <> · {data.progress.pending} pending</>}
            </span>
          )}
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
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">In the written round</span><span className="font-bold text-[var(--bg-dark)]">{written.length}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Short of {MIN_REVIEWERS} reads</span><span className="font-bold text-[var(--bg-dark)]">{needsReview}</span></div>
            <div className="flex items-center justify-between"><span className="text-[var(--muted)]">Reviewer disagreements</span><span className="font-bold text-[var(--bg-dark)]">{disagreements}</span></div>
          </div>
          <p className="mt-3 text-xs text-[var(--muted)]">
            Disagreement = point spread ≥ {DISAGREEMENT_THRESHOLD} of {SCREEN_MAX_POINTS} between reviewers.
          </p>
        </div>
      </div>

      {/* Queue + detail */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {/* Which round this list is showing. The console scores the written
              round; the toggle is here because any member may still look up and
              flag somebody who has already moved into interviews. */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-full border border-[var(--border)]">
              <button
                onClick={() => setRoundFilter("written")}
                className={`px-4 py-1.5 text-sm font-medium ${roundFilter === "written" ? "bg-[var(--gold)] text-[var(--bg-dark)]" : "bg-white text-[var(--bg-dark)]"}`}
              >
                Written round ({written.length})
              </button>
              <button
                onClick={() => setRoundFilter("all")}
                className={`px-4 py-1.5 text-sm font-medium ${roundFilter === "all" ? "bg-[var(--gold)] text-[var(--bg-dark)]" : "bg-white text-[var(--bg-dark)]"}`}
              >
                Everyone ({data.applicants.length})
              </button>
            </div>
            <span className="text-xs text-[var(--muted)]">
              Scored out of {data.maxPoints ?? SCREEN_MAX_POINTS} points.
            </span>
          </div>

          {/* Find one person, or everyone at one stage. */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              aria-label="Search applicants by name or email"
              className="min-w-0 flex-1 rounded-full border border-[var(--border)] bg-white px-4 py-1.5 text-sm placeholder:text-[var(--muted)]"
            />
            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value as Stage | "all")}
              aria-label="Filter by stage"
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm"
            >
              <option value="all">Any stage ({inRound.length})</option>
              {/* Driven by STAGES so a new stage cannot be added to the pipeline
                  and quietly go missing from this filter. Stages nobody is at are
                  listed but disabled, so the set of options stays stable instead
                  of appearing and vanishing as people move through. */}
              {[...STAGES, "rejected" as const, "withdrawn" as const].map((s) => {
                const n = stageCounts.get(s) ?? 0;
                return (
                  <option key={s} value={s} disabled={n === 0}>
                    {STAGE_LABEL[s]} ({n})
                  </option>
                );
              })}
            </select>
            <select
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value as typeof reviewFilter)}
              aria-label="Filter by review progress"
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-sm"
            >
              <option value="all">Any reviews ({inRound.length})</option>
              <option value="none">Not reviewed ({reviewCounts.none})</option>
              <option value="partial">Partly reviewed ({reviewCounts.partial})</option>
              <option value="full">Fully reviewed ({reviewCounts.full})</option>
            </select>
            {(q || stageFilter !== "all" || reviewFilter !== "all") && (
              <button
                onClick={() => { setQuery(""); setStageFilter("all"); setReviewFilter("all"); }}
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--bg-dark)]"
              >
                Clear
              </button>
            )}
            <span className="text-xs tabular-nums text-[var(--muted)]">
              {visible.length} shown
            </span>
            {/* Open to EVERY member, unlike the exec-only import and export. A
                reviewer scores the resume out of 5, so a missing one silently
                costs a candidate points — whoever finds the gap should be able to
                close it rather than wait for an officer. It only ever fills a
                blank, never changes a resume already linked. */}
            <button
              onClick={linkResumes}
              disabled={linkingResumes}
              title="Point any candidate with no resume at the file their application uploaded"
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--bg-dark)] hover:border-[var(--gold)] disabled:opacity-50"
            >
              {linkingResumes ? "Linking…" : "Link missing resumes"}
            </button>
            {/* Exec-only, matching the endpoint. A plain <a download> rather than
                a fetch: the browser streams the file straight to disk under the
                portal session, so the CSV never passes through client memory and
                there is no blob URL left holding applicant data.

                Carries the STAGE filter and nothing else. The search box and the
                review filter are for finding someone on screen; an export is for
                writing to a whole group ("everyone we rejected"), and silently
                narrowing that file by a half-typed name is how the wrong people
                get missed off a mailing. */}
            {canManage && (
              <a
                href={`/api/recruitment/export${stageFilter !== "all" ? `?stage=${stageFilter}` : ""}`}
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--bg-dark)] hover:border-[var(--gold)]"
                title={
                  stageFilter === "all"
                    ? "Download every applicant in this cycle as a spreadsheet"
                    : `Download everyone at "${STAGE_LABEL[stageFilter]}" as a spreadsheet`
                }
              >
                ↓ Export CSV
              </a>
            )}
          </div>
          {/* Bulk decisions, exec only — mirrors `canDecide`, and the API refuses
              everyone else regardless. Appears only once something is ticked, so
              it never takes space from the list it acts on. */}
          {canManage && bulkSelected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gold)] bg-[var(--bg-cream)]/60 px-3 py-2">
              <span className="text-sm font-semibold text-[var(--bg-dark)]">
                {bulkSelected.size} selected
              </span>
              <button
                onClick={() => bulkDecide("rejected")}
                disabled={bulkBusy}
                className="rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {bulkBusy ? "Working…" : "Reject selected"}
              </button>
              <button
                onClick={() => bulkDecide("interview")}
                disabled={bulkBusy}
                className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--bg-dark)] hover:border-[var(--gold)] disabled:opacity-50"
              >
                Advance to first round
              </button>
              <button
                onClick={() => setBulkSelected(new Set())}
                disabled={bulkBusy}
                className="ml-auto text-xs text-[var(--muted)] underline hover:text-[var(--bg-dark)]"
              >
                Clear selection
              </button>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
            <div className={`grid ${canManage ? "grid-cols-[auto_1fr_auto_auto_auto]" : "grid-cols-[1fr_auto_auto_auto]"} gap-3 border-b border-[var(--border)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]`}>
              {canManage && (
                <input
                  type="checkbox"
                  aria-label="Select all shown"
                  className="accent-[var(--gold)]"
                  checked={visible.length > 0 && visible.every((r) => bulkSelected.has(r.applicant.id))}
                  // Acts on what is VISIBLE, not the whole cohort: the filters are
                  // how you build the set you mean, and a "select all" that
                  // silently included 300 filtered-out people would be the most
                  // dangerous control on the page.
                  onChange={(e) => {
                    const next = new Set(bulkSelected);
                    for (const r of visible) {
                      if (e.target.checked) next.add(r.applicant.id);
                      else next.delete(r.applicant.id);
                    }
                    setBulkSelected(next);
                  }}
                />
              )}
              <span>Applicant</span><span>Stage</span><span>Reviews</span><span>Mean</span>
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {visible.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                  {/* A filter matching nothing is not the same as an empty
                      pipeline, and saying "No applicants" over 328 hidden rows
                      sends people looking for a bug. Named first because it is
                      the one the reader can fix. */}
                  {q || stageFilter !== "all" || reviewFilter !== "all"
                    ? "Nobody matches those filters."
                    : queueMode === "mine"
                      ? "Nothing assigned to you yet."
                      : roundFilter === "written"
                        ? "Nobody is in the written round right now."
                        : "No applicants."}
                </li>
              )}
              {visible.map((r) => {
                // Only a candidate still IN the written round can be short of
                // reads; once advanced, the reads are history, not a gap.
                const flag = r.round === "written" && r.reviewCount < MIN_REVIEWERS;
                const disagree = (r.spread ?? 0) >= DISAGREEMENT_THRESHOLD;
                return (
                  <li key={r.applicant.id} className="flex items-center">
                    {/* Outside the button, not inside it: a checkbox nested in a
                        <button> is not clickable independently, so ticking a row
                        would also open it. */}
                    {canManage && (
                      <label className="flex shrink-0 items-center py-3 pl-4 pr-1">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.applicant.name}`}
                          className="accent-[var(--gold)]"
                          checked={bulkSelected.has(r.applicant.id)}
                          onChange={(e) => {
                            const next = new Set(bulkSelected);
                            if (e.target.checked) next.add(r.applicant.id);
                            else next.delete(r.applicant.id);
                            setBulkSelected(next);
                          }}
                        />
                      </label>
                    )}
                    <button
                      onClick={() => setSelectedId(r.applicant.id)}
                      className={`grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-3 pr-4 text-left hover:bg-[var(--bg-cream)]/40 ${canManage ? "pl-2" : "pl-4"} ${selectedId === r.applicant.id ? "bg-[var(--bg-cream)]/60" : ""}`}
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium text-[var(--bg-dark)]">
                          {/* The name truncates; the flags do not. A red flag is
                              the one thing on this row that must survive a long
                              name, so it sits outside the truncating span. */}
                          <span className="truncate">{r.applicant.name}</span>
                          <FlagBadge flags={r.flags} />
                          {r.hasReviewed && <span className="shrink-0 text-[11px] text-[var(--gold-deep)]">✓ yours</span>}
                        </span>
                        <span className="block truncate text-[12px] text-[var(--muted)]">{r.applicant.year} · {r.applicant.major}</span>
                      </span>
                      <span className="rounded-full bg-[var(--bg-cream)] px-2 py-0.5 text-[11px] text-[var(--bg-dark)]">{STAGE_LABEL[r.applicant.stage]}</span>
                      <span className={`text-sm tabular-nums ${flag ? "font-bold text-amber-700" : "text-[var(--muted)]"}`}>{r.reviewCount}{flag ? "!" : ""}</span>
                      <span className={`w-16 text-right text-sm font-semibold tabular-nums ${disagree ? "text-amber-700" : "text-[var(--bg-dark)]"}`}>
                        {r.mean ?? "—"}
                        {r.mean !== null && <span className="text-[11px] font-normal text-[var(--muted)]">/{SCREEN_MAX_POINTS}</span>}
                      </span>
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
            <ReviewPanel key={selected.applicant.id} row={selected} onChanged={reload} canManage={data.canManage} />
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

function ReviewPanel({
  row,
  onChanged,
  canManage,
}: {
  row: Row;
  onChanged: () => Promise<void> | void;
  /** Exec. Gates the stage-decision controls; the API enforces it too. */
  canManage: boolean;
}) {
  const a = row.applicant;
  const [scores, setScores] = useState<Partial<Scores>>(row.myReview?.scores ?? {});
  const [notes, setNotes] = useState(row.myReview?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Presence, not "> 0": 0 is a legitimate score for an unanswered essay, and
  // requiring a positive number would force reviewers to inflate a blank to a 1.
  const scoreComplete = isScreenComplete(scores);
  const runningTotal = screenTotal(scores);
  // Scoring belongs to the written round. Once a candidate is advanced they are
  // being scored on the interview rubrics instead, and the API refuses a late
  // screen review — so the form is read-only here rather than failing on submit.
  const scorable = row.round === "written";

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
  const isTerminal = isTerminalStage(a.stage);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <h3 className="font-display text-xl font-extrabold text-[var(--bg-dark)]">{a.name}</h3>
      <p className="text-sm text-[var(--muted)]">{a.email}</p>
      <p className="mt-1 text-sm text-[var(--bg-dark)]">{a.year} · {a.major} · {a.college}</p>

      <ApplicationResume applicantId={a.id} name={a.name} />

      {Object.entries(a.responses).map(([k, v]) =>
        v ? (
          <div key={k} className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{k}</p>
            <p className="text-sm text-[var(--bg-dark)]">{v}</p>
          </div>
        ) : null
      )}

      <hr className="my-4 border-[var(--border)]" />
      <FlagPanel applicantId={a.id} flags={row.flags} onChanged={onChanged} />

      {/* Only once they have LEFT the written round, and only for exec. Both
          halves of that matter: showing the other reader's marks while scoring
          is still open is precisely what blind review exists to prevent, and
          `canManage` mirrors the endpoint, which refuses everyone else. */}
      {canManage && row.round !== "written" && (
        <>
          <hr className="my-4 border-[var(--border)]" />
          <WrittenVerdicts key={a.id} applicantId={a.id} name={a.name} />
        </>
      )}

      <hr className="my-4 border-[var(--border)]" />
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">Your rubric</p>
        <span className="text-sm font-semibold tabular-nums text-[var(--bg-dark)]">
          {runningTotal}
          <span className="font-normal text-[var(--muted)]"> / {SCREEN_MAX_POINTS}</span>
        </span>
      </div>
      {!scorable && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          {a.name.split(" ")[0]} has left the written round ({STAGE_LABEL[a.stage] ?? a.stage}), so
          this rubric is read-only. Their interview rubrics live in the interview console.
        </p>
      )}
      {/* Each criterion runs 0..its own max — the case essay is worth 7, a short
          essay 3 — so the row length is the ceiling, visibly. */}
      <div className="mt-3 space-y-3">
        {RUBRIC.map((c) => (
          <div key={c.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-[var(--bg-dark)]">{c.label}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                {scores[c.key] ?? "–"} / {c.max}
              </span>
            </div>
            <p className="text-[11px] text-[var(--muted)]">{c.anchor}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {Array.from({ length: c.max + 1 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  disabled={!scorable}
                  onClick={() => setScores((s) => ({ ...s, [c.key]: n }))}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${Number(scores[c.key]) === n ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--bg-dark)]" : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--gold)]"}`}
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
        disabled={!scorable}
        rows={2}
        placeholder="Notes (optional)"
        className="mt-3 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)] disabled:bg-[var(--bg-cream)]/40"
      />
      <button onClick={submitReview} disabled={busy || !scoreComplete || !scorable} className="btn btn-gold mt-3 w-full disabled:opacity-50">
        {row.hasReviewed ? "Update review" : "Submit review"}
      </button>
      {scorable && !scoreComplete && (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">
          Score every criterion to submit — a 0 counts as a score.
        </p>
      )}

      {canManage && <ReroutePanel row={row} onChanged={onChanged} />}

      {/* Stage changes are exec-only (see lib/access.ts canDecide). Non-exec
          reviewers score candidates; exec acts on the aggregate. Hiding these
          mirrors the API, which returns 403 for everyone else. */}
      {canManage && (
        <>
          <hr className="my-4 border-[var(--border)]" />
          <p className="eyebrow">Decision</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {advance && (
              <button onClick={() => decide(advance)} disabled={busy} className="btn btn-gold-outline text-xs px-3 py-1.5">
                Advance → {STAGE_LABEL[advance]}
              </button>
            )}
            {/* Reopening is the counterpart to Reject, and it needs to be a
                first-class button rather than something buried in the picker
                below. A rejection made in error is the one stage change people
                actually need to undo — and until this existed there was no way
                to: `nextStage("rejected")` is null and Reject hides itself once
                taken, so a rejected candidate had NO controls at all and was
                stuck there permanently.

                Reopening to `applied` rather than to whatever they were before,
                because `decisions` upserts one row per applicant and therefore
                keeps no history — there is no prior stage to restore. Landing
                them back at the start of the written round is honest about that,
                and their existing reviews are untouched, so they return with
                their scores intact rather than needing a re-read. */}
            {isTerminal && (
              <button onClick={() => decide("applied")} disabled={busy} className="btn btn-gold-outline text-xs px-3 py-1.5">
                Reopen → Applied
              </button>
            )}
            {a.stage !== "rejected" && (
              <button onClick={() => decide("rejected")} disabled={busy} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50">
                Reject
              </button>
            )}
          </div>

          {/* Every stage, in both directions. The buttons above cover the path the
              process actually takes; this covers the corrections — a candidate
              advanced by mistake, or one rejected who should go back to a
              specific stage rather than to the start. Value resets to "" after
              each change so it reads as an action, not as current state. */}
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--muted)]">
            Move to
            <select
              value=""
              disabled={busy}
              onChange={(e) => { if (e.target.value) decide(e.target.value as Stage); }}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs text-[var(--bg-dark)]"
            >
              <option value="">Choose a stage…</option>
              {ALL_STAGES.filter((s) => s !== a.stage).map((s) => (
                <option key={s} value={s}>{STAGE_LABEL[s]}</option>
              ))}
            </select>
          </label>
          {isTerminal && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {a.name.split(" ")[0]} is {STAGE_LABEL[a.stage]?.toLowerCase()} and is hidden from the
              written round. Reopening puts them back in the queue with their existing reviews.
            </p>
          )}
        </>
      )}
      {toast && <p className="mt-3 text-sm text-[var(--gold-deep)]">{toast}</p>}
    </div>
  );
}

/**
 * What the two written readers actually said about a candidate who has already
 * left the written round — both rubrics and both sets of notes, unblinded.
 *
 * This is the decision queue's expanded row, shown again after the fact. The
 * queue is a work list: a candidate drops out of it the moment they are rejected
 * or advanced, which is the moment the reads stop being a decision and start
 * being a RECORD. Rejected applicants write in asking why, and until this existed
 * the only person who could answer was whoever happened to remember reading them
 * — the marks were still in the database with no surface left that showed them.
 *
 * Fetched here rather than folded into the reviewer feed on purpose. That feed
 * goes to all ~33 reviewers and deliberately carries nobody's scores but your
 * own; putting unblinded verdicts in it would hand every reviewer everyone
 * else's marks, which is the one thing the blind screen is built to stop. So the
 * data comes from the exec-only decisions route instead, one candidate at a time.
 */
function WrittenVerdicts({ applicantId, name }: { applicantId: string; name: string }) {
  const [row, setRow] = useState<DecisionRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Aborted on unmount and on a change of candidate: clicking down a list of
  // rejections fires a request per name, and without this a slow early one can
  // land last and show the wrong person's notes under the right person's name.
  //
  // Nothing is cleared on the way in, because nothing has to be: the caller keys
  // this component by applicant id, so a new candidate is a fresh mount with
  // empty state rather than a stale one being reset.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch(
          `/api/recruitment/decisions?applicant_id=${encodeURIComponent(applicantId)}`,
          { signal: ctrl.signal, cache: "no-store" }
        );
        const j = await r.json();
        if (ctrl.signal.aborted) return;
        if (!r.ok) setError(j.error || "Could not load the written reviews.");
        else setRow(j.row as DecisionRow);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setError("Could not load the written reviews.");
      }
    })();
    return () => ctrl.abort();
  }, [applicantId]);

  const first = name.split(" ")[0];

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <p className="eyebrow">What the readers said</p>
        {row?.mean !== null && row?.mean !== undefined && (
          <span className="text-sm font-semibold tabular-nums text-[var(--bg-dark)]">
            {row.mean}
            <span className="font-normal text-[var(--muted)]"> / {SCREEN_MAX_POINTS}</span>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Both written rubrics, unblinded — what to read from if {first} asks for feedback.
      </p>
      {/* The same warning the decision queue carries, and it matters more here:
          quoting the mean of a 25 and an 11 back to a candidate describes a
          review that nobody actually wrote. */}
      {row?.disagreement && (
        <p className="mt-1 text-xs text-amber-700">
          The two readers were {row.spread} points apart — read both, not the average.
        </p>
      )}
      <div className="mt-3">
        {error ? (
          <p className="text-xs text-amber-700">{error}</p>
        ) : !row ? (
          <p className="text-xs text-[var(--muted)]">Loading the written reviews…</p>
        ) : (
          <VerdictCards
            verdicts={row.verdicts}
            columns="sm:grid-cols-2 lg:grid-cols-1"
            empty={`Nobody submitted a written review of ${first} before they left the written round.`}
          />
        )}
      </div>
    </>
  );
}

// ── Flags ────────────────────────────────────────────────────────────────────
// Anyone signed in can flag an applicant red (concern) or green (endorsement)
// with a required note. Append-only: no edit/delete surface.

function FlagPanel({
  applicantId,
  flags,
  onChanged,
}: {
  applicantId: string;
  flags: Row["flags"];
  onChanged: () => Promise<void> | void;
}) {
  const [color, setColor] = useState<"red" | "green">("red");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function submit() {
    if (!description.trim()) return;
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: applicantId, color, description: description.trim() }),
      });
      const res = await r.json();
      if (res.ok) {
        setDescription("");
        await onChanged();
      } else setToast(res.message || res.error || "Could not submit flag.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="eyebrow">Flags</p>
      {flags.length > 0 && (
        <ul className="mt-2 space-y-2">
          {flags.map((f) => {
            const early = wasFiledBeforeApplying(f);
            return (
              <li key={f.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.color === "red" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                    {f.color === "red" ? "Red flag" : "Green flag"}
                  </span>
                  {f.event && (
                    <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[11px] text-[var(--muted)]">
                      {f.event}
                    </span>
                  )}
                  {/* Filed at an event, before this application existed — so the
                      note was written about the person, not about their answers. */}
                  {early && (
                    <span className="rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--gold-deep)]">
                      Before applying
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[var(--bg-dark)]">{f.description}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  — {f.submitter_email ?? "anonymous"}
                  {early && ` · ${new Date(f.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => setColor("red")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${color === "red" ? "border-red-300 bg-red-100 text-red-700" : "border-[var(--border)] bg-white text-[var(--bg-dark)]"}`}
        >
          Red flag
        </button>
        <button
          type="button"
          onClick={() => setColor("green")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${color === "green" ? "border-green-300 bg-green-100 text-green-700" : "border-[var(--border)] bg-white text-[var(--bg-dark)]"}`}
        >
          Green flag
        </button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="What happened? (required)"
        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
      />
      <button onClick={submit} disabled={busy || !description.trim()} className="btn btn-gold-outline mt-2 text-xs px-4 py-2 disabled:opacity-50">
        {busy ? "Submitting…" : "Submit flag"}
      </button>
      {toast && <p className="mt-2 text-sm text-[var(--gold-deep)]">{toast}</p>}
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Someone who hasn&apos;t applied?{" "}
        <Link href="/portal/flags" className="underline hover:text-[var(--gold-deep)]">
          Flag them by email
        </Link>{" "}
        — it attaches when they apply.
      </p>
    </div>
  );
}

/**
 * Exec reroutes one candidate's reviewers.
 *
 * The delibs-day case: somebody did not show, and this candidate needs an eye on
 * them now. Swap replaces a reviewer in one operation, which is why it is offered
 * as its own action — removing first would trip the two-reviewer minimum for a
 * change that ends up back where it started.
 */
function ReroutePanel({ row, onChanged }: { row: Row; onChanged: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pool, setPool] = useState<{ email: string; name?: string | null }[]>([]);
  const [addTo, setAddTo] = useState("");
  const [swapFrom, setSwapFrom] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/recruitment/reviewers")
      .then((r) => (r.ok ? r.json() : { reviewers: [] }))
      .then((j) => { if (alive) setPool(j.reviewers ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  /** `silent` suppresses the error message for an attempt whose refusal is
   *  EXPECTED and about to be turned into a confirmation prompt — otherwise the
   *  removal flow flashes a red error before asking the question. */
  async function send(
    body: Record<string, unknown>,
    opts: { silent?: boolean } = {}
  ): Promise<{ ok: boolean; error?: string; assigned?: string[] } | null> {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/recruitment/assign/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: row.applicant.id, ...body }),
      });
      const j = await r.json();
      if (j.ok) {
        setMsg(`Now assigned: ${j.assigned?.join(", ") || "nobody"}`);
        setAddTo("");
        setSwapFrom("");
        await onChanged();
      } else if (!opts.silent) {
        setMsg(j.error || j.message || "Could not reroute.");
      }
      return j;
    } catch {
      if (!opts.silent) setMsg("Could not reroute.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Take a reviewer off this candidate.
   *
   * The API refuses a removal that drops below the two-reviewer minimum, which
   * is the right default — that minimum is the fairness guarantee of the whole
   * screen. But exec has legitimate reasons to override: somebody left the club
   * mid-cycle, or was assigned to a candidate they turn out to know personally,
   * and leaving a phantom assignee is worse than being briefly under-covered.
   *
   * So the refusal is surfaced as a question rather than a dead end: the server
   * explains what the removal would cost, and exec confirms it deliberately
   * before the retry carries `force`. Never forced on the first attempt — the
   * confirmation is the point.
   */
  async function remove(email: string) {
    const first = await send({ action: "remove", from: email }, { silent: true });
    if (first?.ok) return;

    const reason = first?.error ?? "That removal was refused.";
    if (!window.confirm(`${reason}\n\nRemove ${email} anyway?`)) {
      setMsg("Removal cancelled.");
      return;
    }
    await send({ action: "remove", from: email, force: true });
  }

  const assigned = row.assignedReviewers ?? [];
  const done = new Set(row.reviewedBy ?? []);
  // Enough independent reads are already in — see computeCoverage, where the
  // same rule empties `outstanding`.
  const hasEnough = done.size >= MIN_REVIEWERS;
  // Never offer someone already on the candidate, or the candidate themselves.
  const available = pool
    .map((p) => p.email)
    .filter((e) => !assigned.includes(e.toLowerCase()) && e.toLowerCase() !== row.applicant.email.toLowerCase());

  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 p-3">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Reviewers</p>
        {row.underAssigned && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            below {MIN_REVIEWERS}
          </span>
        )}
      </div>

      <ul className="mt-2 space-y-1">
        {assigned.length === 0 && <li className="text-xs text-[var(--muted)]">Nobody assigned yet.</li>}
        {assigned.map((email) => (
          <li key={email} className="flex items-center justify-between gap-2 text-xs">
            <span className={done.has(email) ? "text-[var(--bg-dark)]" : "text-[var(--muted)]"}>
              {email}{" "}
              {done.has(email)
                ? "· reviewed"
                : hasEnough
                  ? // Not "pending": the candidate already has enough reads, so
                    // this person is not holding anything up and should not read
                    // as a chore somebody still owes.
                    "· not needed"
                  : "· pending"}
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                onClick={() => setSwapFrom(swapFrom === email ? "" : email)}
                disabled={busy}
                className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] font-semibold hover:bg-white disabled:opacity-50"
              >
                {swapFrom === email ? "cancel" : "replace"}
              </button>
              <button
                onClick={() => remove(email)}
                disabled={busy}
                title={`Remove ${email} from this candidate`}
                className="rounded-full border border-red-200 px-2 py-0.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={addTo}
          onChange={(e) => setAddTo(e.target.value)}
          className="max-w-full rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs"
        >
          <option value="">{swapFrom ? `Replace ${swapFrom} with…` : "Add a reviewer…"}</option>
          {available.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <button
          onClick={() => send(swapFrom ? { action: "swap", from: swapFrom, to: addTo } : { action: "add", to: addTo })}
          disabled={busy || !addTo}
          className="btn btn-gold-outline text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? "Working…" : swapFrom ? "Swap" : "Assign"}
        </button>
        {assigned.length > MIN_REVIEWERS && !swapFrom && (
          <button
            onClick={() => { const who = assigned[assigned.length - 1]; send({ action: "remove", from: who }); }}
            disabled={busy}
            className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-white disabled:opacity-50"
          >
            Drop one
          </button>
        )}
      </div>

      {msg && <p className="mt-2 text-xs text-[var(--gold-deep)]">{msg}</p>}
    </div>
  );
}

/**
 * Exec picks who is actually reviewing this cycle before the random spread runs.
 *
 * The eligible pool is everyone with a reviewer role, but in practice a chunk of
 * them are studying abroad, graduating, or simply not doing this round. Spreading
 * applications onto those people strands the reads: the applicant looks covered,
 * two names sit against them, and neither review ever arrives. Unticking them up
 * front is the difference between a queue that closes and one that has to be
 * repaired by hand during delibs.
 *
 * Default is "not narrowed" (`selected === null`) — the whole pool, unchanged
 * behaviour — rather than a pre-ticked list, so exec has to make the choice
 * deliberately and cannot silently inherit last cycle's absentees.
 */
function ReviewerPoolPicker({
  pool,
  selected,
  onChange,
  error,
}: {
  pool: { email: string; name?: string | null }[] | null;
  selected: Set<string> | null;
  onChange: (next: Set<string> | null) => void;
  /** Validation from the parent — the same value that disables the run button. */
  error?: string;
}) {
  if (pool === null) {
    return <p className="w-full text-xs text-[var(--muted)]">Loading reviewers…</p>;
  }
  if (pool.length === 0) {
    return (
      <p className="w-full text-xs text-[var(--muted)]">
        No eligible reviewers. Seed members with a reviewer role first.
      </p>
    );
  }

  // `null` renders as all-ticked: it means the run will use everyone.
  const isOn = (email: string) => (selected === null ? true : selected.has(email));
  const count = selected === null ? pool.length : selected.size;


  function toggle(email: string) {
    const base = selected === null ? new Set(pool!.map((p) => p.email)) : new Set(selected);
    if (base.has(email)) base.delete(email);
    else base.add(email);
    // Back to the full pool → drop the narrowing entirely, so the request omits
    // reviewer_emails and the server applies its own default.
    onChange(base.size === pool!.length ? null : base);
  }

  return (
    <div className="w-full mt-1 rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-[var(--bg-dark)]">
          Reviewing this cycle
          <span className="ml-2 font-normal text-[var(--muted)]">
            {count} of {pool.length} selected
          </span>
        </p>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={() => onChange(null)} className="underline text-[var(--muted)] hover:text-[var(--bg-dark)]">
            All
          </button>
          <button
            onClick={() => onChange(new Set())}
            className="underline text-[var(--muted)] hover:text-[var(--bg-dark)]"
          >
            None
          </button>
        </div>
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-64 overflow-y-auto">
        {pool.map((r) => (
          <li key={r.email}>
            <label className="flex items-center gap-2 py-1 cursor-pointer text-[13px] text-[var(--bg-dark)]">
              <input
                type="checkbox"
                checked={isOn(r.email)}
                onChange={() => toggle(r.email)}
                className="accent-[var(--gold-deep)] w-3.5 h-3.5 shrink-0"
              />
              <span className="truncate" title={r.email}>
                {r.name || r.email}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {/* Passed down from the parent, which derives it from the same function the
          route enforces with — so this warning, the disabled button, and the
          server's refusal can never disagree. */}
      {error && <p className="mt-2 text-xs text-amber-800">{error}</p>}
      {selected === null && !error && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Everyone is included. Untick anyone who isn&rsquo;t reviewing this cycle.
        </p>
      )}
    </div>
  );
}

/**
 * Exec-only full reshuffle: tear down the current spread and deal again.
 *
 * A separate control from "Assign reviewers" because the two do different
 * things. The normal run only TOPS UP — it fills applicants who are short of k
 * and never moves anyone, which is what you want mid-cycle as candidates
 * trickle in. A reshuffle throws the existing allocation away, which is what you
 * want after changing the reviewer pool or clearing out test data.
 *
 * Destructive, so it confirms in place rather than firing on the first click.
 * An inline two-step is used instead of window.confirm() deliberately: a native
 * modal blocks the page, and this keeps the warning readable while deciding.
 */
function ReshuffleButton({
  disabled,
  busy,
  onConfirm,
}: {
  disabled?: boolean;
  busy?: boolean;
  onConfirm: () => Promise<void> | void;
}) {
  const [armed, setArmed] = useState(false);

  // Derived, not synced: a disabled button is never shown armed, so a stale
  // "Confirm" cannot sit waiting behind a pool error and fire later. Computing
  // it beats an effect that writes state back on every disabled change.
  const showArmed = armed && !disabled;

  if (!showArmed) {
    return (
      <button
        onClick={() => setArmed(true)}
        disabled={disabled}
        className="text-xs px-4 py-2 rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-red-300 hover:text-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Clear every current assignment and deal again from scratch"
      >
        Reshuffle from scratch
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1.5">
      <span className="text-xs text-red-800">
        Clear all current assignments and re-deal?
      </span>
      <button
        onClick={async () => {
          setArmed(false);
          await onConfirm();
        }}
        disabled={busy}
        className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-full px-3 py-1 disabled:opacity-50"
      >
        {busy ? "Working…" : "Yes, reshuffle"}
      </button>
      <button
        onClick={() => setArmed(false)}
        className="text-xs text-[var(--muted)] hover:text-[var(--bg-dark)]"
      >
        Cancel
      </button>
    </span>
  );
}

/**
 * The candidate's resume, inline, in the written console.
 *
 * The written rubric scores the resume out of 5, so this is not a nicety — a
 * reviewer who cannot see the resume cannot honestly fill in that row. The file
 * is streamed by /api/recruitment/resume/<applicant id> under our own auth, so
 * the Drive file id never reaches the browser (see that route).
 *
 * Collapsed by default. Most of the reading here is essays, and a 60vh iframe
 * between the applicant's name and their answers pushes the actual application
 * off the screen.
 */
function ApplicationResume({ applicantId, name }: { applicantId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const src = `/api/recruitment/resume/${applicantId}`;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="btn btn-gold-outline text-xs px-3 py-1.5"
          aria-expanded={open}
        >
          {open ? "Hide resume" : "Show resume"}
        </button>
        <a href={src} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--gold-deep)] hover:underline">
          Open in a new tab ↗
        </a>
      </div>
      {open && (
        <iframe
          src={src}
          title={`${name} resume`}
          className="mt-2 h-[55vh] w-full rounded-xl border border-[var(--border)]"
        />
      )}
      {/* No pre-flight check that a resume exists: the feed does not carry the
          pointer, and the route answers 404 with a readable message, which is the
          same information one request later without a second round trip on every
          candidate a reviewer clicks. */}
    </div>
  );
}
