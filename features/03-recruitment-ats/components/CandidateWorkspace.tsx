"use client";

// One candidate in ONE ROUND: their resume on the left, that round's two rubrics on
// the right. No tab-hunting, no Drive, no copying a template into a folder.
//
// Everything here is scoped to `round` — the rubrics written, the panel edited, and
// the stage the exec controls advance to. The same component serves the first and
// final rounds because the work is the same; what differs is which rubric kinds it
// writes and who is allowed to be in the room.

import { useState } from "react";
import {
  INTERVIEW_RUBRICS,
  KIND_LABEL,
  RECOMMENDATIONS,
  ROUND_KINDS,
  isComplete,
  type Candidate,
  type InterviewKind,
  type Reviewer,
} from "@/features/03-recruitment-ats/lib/interview";
import { ROUND_LABEL, type InterviewRound } from "@/features/03-recruitment-ats/lib/rounds";
import type { Stage } from "@/features/03-recruitment-ats/lib/types";

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied", screened: "Screened", interview: "First round",
  final_round: "Final round", offer: "Offer", accepted: "Accepted",
  rejected: "Rejected", withdrawn: "Withdrawn",
};

/**
 * Where a candidate goes when this round is done with them.
 *
 * The written round hands off in the exec decision queue; these two hand off here,
 * in front of the rubrics that justify the call, rather than in a third list that
 * would show the scores without the notes.
 */
const NEXT_STAGE: Record<InterviewRound, { stage: Stage; label: string }> = {
  first_round: { stage: "final_round", label: "Advance → Final round" },
  final_round: { stage: "offer", label: "Advance → Offer" },
};

export function CandidateWorkspace({
  candidate,
  round,
  canManage,
  pool,
  demo,
  onBack,
  onChanged,
}: {
  candidate: Candidate;
  round: InterviewRound;
  canManage: boolean;
  pool: Reviewer[];
  demo: boolean;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const kinds = ROUND_KINDS[round];
  const [kind, setKind] = useState<InterviewKind>(kinds[0]);
  // Exec may correct any rubric; everyone else only writes for candidates they're on.
  const editable = candidate.assignedToMe || canManage;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            onClick={onBack}
            className="text-sm font-medium text-[var(--gold-deep)] hover:underline"
          >
            ← Back to search
          </button>
          <p className="mt-2 eyebrow">{ROUND_LABEL[round]}</p>
          <h2 className="mt-1 font-display text-3xl font-extrabold text-[var(--bg-dark)]">
            {candidate.name}
          </h2>
          <p className="text-sm text-[var(--muted)]">{candidate.email}</p>
          <p className="mt-1 text-sm text-[var(--bg-dark)]">
            {[candidate.year, candidate.major, candidate.college].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--bg-cream)] px-3 py-1 text-xs font-semibold text-[var(--bg-dark)]">
            {STAGE_LABEL[candidate.stage] ?? candidate.stage}
          </span>
          {candidate.assignedToMe && (
            <span className="rounded-full bg-[var(--gold)]/20 px-3 py-1 text-xs font-semibold text-[var(--gold-deep)]">
              Yours to interview
            </span>
          )}
        </div>
      </div>

      {!editable && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)]/60 px-5 py-3 text-sm text-[var(--bg-dark)]">
          You&rsquo;re not on this candidate&rsquo;s {ROUND_LABEL[round].toLowerCase()} panel, so their
          rubrics are read-only for you. You can still read the resume.
        </div>
      )}

      {canManage && (
        <PanelEditor candidate={candidate} round={round} pool={pool} demo={demo} onChanged={onChanged} />
      )}
      {canManage && <RoundDecision candidate={candidate} round={round} onChanged={onChanged} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <ResumePane candidate={candidate} />

        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <div className="inline-flex overflow-hidden rounded-full border border-[var(--border)]">
            {kinds.map((k) => {
              const done = candidate.myRubrics[k] && isComplete(k, candidate.myRubrics[k]!.scores);
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`px-4 py-1.5 text-sm font-medium ${
                    kind === k ? "bg-[var(--gold)] text-[var(--bg-dark)]" : "bg-white text-[var(--bg-dark)]"
                  }`}
                >
                  {KIND_LABEL[k]}
                  {done && <span className="ml-1.5 text-[11px]">✓</span>}
                </button>
              );
            })}
          </div>

          {/* key → a fresh form (and fresh local state) per candidate + rubric */}
          <RubricForm
            key={`${candidate.id}:${kind}`}
            candidate={candidate}
            kind={kind}
            editable={editable}
            onChanged={onChanged}
          />
        </div>
      </div>
    </div>
  );
}

// ── Resume ───────────────────────────────────────────────────────────────────

function ResumePane({ candidate }: { candidate: Candidate }) {
  const src = `/api/recruitment/resume/${candidate.id}`;
  const resume = candidate.resume;
  // Google Docs are exported to PDF by the API, so anything but a real Word file renders inline.
  const inlineViewable =
    !resume?.mime ||
    resume.mime === "application/pdf" ||
    resume.mime === "application/vnd.google-apps.document";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">Resume</p>
        <div className="flex items-center gap-3">
          {/* The provisioned Drive folder, for interviewers who'd rather grade in Docs. */}
          {candidate.driveFolderUrl && (
            <a
              href={candidate.driveFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[var(--gold-deep)] hover:underline"
            >
              Drive folder ↗
            </a>
          )}
          {resume && (
            <a href={src} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--gold-deep)] hover:underline">
              Open in a new tab ↗
            </a>
          )}
        </div>
      </div>

      {!resume ? (
        <div className="mt-4 grid h-[60vh] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-cream)]/40 p-6 text-center">
          <div>
            <p className="font-semibold text-[var(--bg-dark)]">No resume linked</p>
            <p className="mt-1 max-w-xs text-sm text-[var(--muted)]">
              An exec can run <span className="font-medium">Sync resumes</span> to pull it from the Drive folder.
            </p>
          </div>
        </div>
      ) : inlineViewable ? (
        <iframe src={src} title={`${candidate.name} resume`} className="mt-4 h-[60vh] w-full rounded-xl border border-[var(--border)]" />
      ) : (
        <div className="mt-4 grid h-[60vh] place-items-center rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-cream)]/40 p-6 text-center">
          <div>
            <p className="font-semibold text-[var(--bg-dark)]">{resume.name}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">This format can&rsquo;t preview in the browser.</p>
            <a href={src} target="_blank" rel="noreferrer" className="btn btn-gold-outline mt-4 text-xs px-4 py-2">
              Open resume
            </a>
          </div>
        </div>
      )}

      {resume?.match === "fuzzy" && (
        <p className="mt-2 text-xs text-amber-700">
          Matched by name similarity from “{resume.name}” — worth a glance to confirm it&rsquo;s the right person.
        </p>
      )}
    </div>
  );
}

// ── Rubric ───────────────────────────────────────────────────────────────────

function RubricForm({
  candidate,
  kind,
  editable,
  onChanged,
}: {
  candidate: Candidate;
  kind: InterviewKind;
  editable: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const existing = candidate.myRubrics[kind];
  const [scores, setScores] = useState<Record<string, number>>(existing?.scores ?? {});
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [recommendation, setRecommendation] = useState<string>(existing?.recommendation ?? "");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const rubric = INTERVIEW_RUBRICS[kind];
  const complete = isComplete(kind, scores);
  const othersDone = Math.max(0, candidate.completed[kind] - (existing && isComplete(kind, existing.scores) ? 1 : 0));

  function set<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
      setToast(null);
    };
  }

  async function save() {
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/interview/rubric", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_id: candidate.id,
          kind,
          scores,
          notes,
          recommendation: recommendation || null,
        }),
      });
      const res = await r.json();
      if (res.ok) {
        setToast("Saved.");
        setDirty(false);
        await onChanged();
      } else {
        setToast(res.message || res.error || "Could not save.");
      }
    } catch {
      setToast("Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Score each 1–5. This is your copy for {candidate.name.split(" ")[0]} — the template stays untouched.
        </p>
        {othersDone > 0 && (
          <span className="shrink-0 text-xs text-[var(--muted)]">
            {othersDone} other {othersDone === 1 ? "panelist has" : "panelists have"} submitted
          </span>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {rubric.map((c) => (
          <div key={c.key}>
            <span className="text-sm font-semibold text-[var(--bg-dark)]">{c.label}</span>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">{c.anchor}</p>
            <div className="mt-2 flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={!editable}
                  onClick={() => set<Record<string, number>>(setScores)({ ...scores, [c.key]: n })}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    Number(scores[c.key]) === n
                      ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--bg-dark)]"
                      : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--gold)]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <span className="text-sm font-semibold text-[var(--bg-dark)]">Recommendation</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {RECOMMENDATIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={!editable}
              onClick={() => set<string>(setRecommendation)(recommendation === r.key ? "" : r.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                recommendation === r.key
                  ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--bg-dark)]"
                  : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--gold)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => set<string>(setNotes)(e.target.value)}
        disabled={!editable}
        rows={5}
        placeholder={
          kind.endsWith("case")
            ? "What did they do with the case? Where did they get stuck?"
            : "Specific moments, quotes, and follow-ups worth remembering."
        }
        className="mt-4 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)] disabled:bg-[var(--bg-cream)]/40"
      />

      {editable && (
        <button onClick={save} disabled={busy || !complete || !dirty} className="btn btn-gold mt-3 w-full disabled:opacity-50">
          {busy ? "Saving…" : existing ? "Update rubric" : "Submit rubric"}
        </button>
      )}
      {editable && !complete && (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">Score every criterion to save.</p>
      )}
      {toast && <p className="mt-2 text-center text-sm text-[var(--gold-deep)]">{toast}</p>}
    </div>
  );
}

// ── Round hand-off (exec) ────────────────────────────────────────────────────

/**
 * Exec moves the candidate on, or out, from inside the round.
 *
 * Deliberately here rather than in a fourth list: the decision this button makes
 * is justified by the rubrics and notes on the same screen, and a separate queue
 * would show the scores without the room they came from. The written round is the
 * exception — it has its own queue because two blind readers have to be unblinded
 * side by side before anyone can decide, which is a different job from this one.
 *
 * Hidden for non-exec, and refused for them by /api/recruitment/decisions anyway
 * (lib/access.ts canDecide).
 */
function RoundDecision({
  candidate,
  round,
  onChanged,
}: {
  candidate: Candidate;
  round: InterviewRound;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const next = NEXT_STAGE[round];

  async function decide(stage: Stage, label: string) {
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: candidate.id, stage }),
      });
      const res = await r.json();
      if (res.ok) {
        setToast(`${candidate.name.split(" ")[0]} → ${label}.`);
        // The candidate leaves this round's board on the next fetch, which is the
        // visible confirmation that the move landed.
        await onChanged();
      } else setToast(res.message || res.error || "Could not update stage.");
    } catch {
      setToast("Could not update stage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <p className="eyebrow">Decision</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Moving {candidate.name.split(" ")[0]} on takes them off this round&rsquo;s board.
        {round === "first_round" && " The final round is exec-only from there."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => decide(next.stage, STAGE_LABEL[next.stage])}
          disabled={busy}
          className="btn btn-gold text-xs px-3 py-1.5 disabled:opacity-50"
        >
          {next.label}
        </button>
        <button
          onClick={() => decide("rejected", "Rejected")}
          disabled={busy}
          className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          Reject
        </button>
        <span className="text-xs text-[var(--muted)]">
          Currently {STAGE_LABEL[candidate.stage] ?? candidate.stage}
        </span>
      </div>
      {toast && <p className="mt-2 text-sm text-[var(--gold-deep)]">{toast}</p>}
    </div>
  );
}

// ── Panel assignment (exec) ──────────────────────────────────────────────────

function PanelEditor({
  candidate,
  round,
  pool,
  demo,
  onChanged,
}: {
  candidate: Candidate;
  round: InterviewRound;
  pool: Reviewer[];
  demo: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<string[]>(candidate.panel);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function toggle(email: string) {
    setSelected((s) => (s.includes(email) ? s.filter((e) => e !== email) : [...s, email]));
    setToast(null);
  }

  async function save() {
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/interview/panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: candidate.id, interviewer_emails: selected, round }),
      });
      const res = await r.json();
      if (res.ok) {
        // The route intersects the list with who may interview in this round, so
        // say what it actually saved rather than what was ticked.
        const dropped = res.ignored?.length
          ? ` ${res.ignored.length} dropped (not eligible for this round).`
          : "";
        setToast(`Panel saved.${dropped}`);
        await onChanged();
      } else setToast(res.message || res.error || "Could not save the panel.");
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    selected.length !== candidate.panel.length || selected.some((e) => !candidate.panel.includes(e));

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <p className="eyebrow">{ROUND_LABEL[round]} panel</p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Whoever is listed here can fill in this candidate&rsquo;s {ROUND_LABEL[round].toLowerCase()}{" "}
        rubrics — and only this candidate&rsquo;s, and only this round&rsquo;s. The other round&rsquo;s
        panel is set separately and is unaffected.
      </p>
      {pool.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          {demo
            ? "Connect Supabase to assign a panel."
            : round === "final_round"
              ? "No exec members found — the final round is staffed by exec only."
              : "No members with an interviewer role yet."}
        </p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pool.map((p) => {
              const on = selected.includes(p.email);
              return (
                <button
                  key={p.email}
                  type="button"
                  onClick={() => toggle(p.email)}
                  title={p.email}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    on
                      ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--bg-dark)]"
                      : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--gold)]"
                  }`}
                >
                  {p.name || p.email}
                </button>
              );
            })}
          </div>
          <button onClick={save} disabled={busy || !dirty} className="btn btn-gold-outline mt-3 text-xs px-4 py-2 disabled:opacity-50">
            {busy ? "Saving…" : "Save panel"}
          </button>
        </>
      )}
      {toast && <span className="ml-3 text-sm text-[var(--gold-deep)]">{toast}</span>}
    </div>
  );
}
