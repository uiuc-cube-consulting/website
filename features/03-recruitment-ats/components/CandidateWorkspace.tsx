"use client";

// One candidate in ONE ROUND: their resume on the left, that round's two rubrics on
// the right. No tab-hunting, no Drive, no copying a template into a folder.
//
// Everything here is scoped to `round` — the rubrics written, the panel edited, and
// the stage the exec controls advance to. The same component serves the first and
// final rounds because the work is the same; what differs is which rubric kinds it
// writes and who is allowed to be in the room.

import { useState } from "react";
import { FlagBadge } from "@/features/03-recruitment-ats/components/FlagBadge";
import { FlagPanel } from "@/features/03-recruitment-ats/components/FlagPanel";
import {
  INTERVIEW_RUBRICS,
  KIND_LABEL,
  RECOMMENDATIONS,
  ROUND_KINDS,
  SCORE_KEY,
  SCORE_STEP,
  panelStanding,
  formatScore,
  recommendationLabel,
  BEHAVIORAL_QUESTIONS,
  isComplete,
  rubricMax,
  submittedTotal,
  type Candidate,
  type InterviewKind,
  type PanelNote,
  type Reviewer,
} from "@/features/03-recruitment-ats/lib/interview";
import { ROUND_ADVANCE, ROUND_LABEL, type InterviewRound } from "@/features/03-recruitment-ats/lib/rounds";
import type { Stage } from "@/features/03-recruitment-ats/lib/types";

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied", screened: "Screened", interview: "First round",
  final_round: "Final round", offer: "Offer", accepted: "Accepted",
  rejected: "Rejected", withdrawn: "Withdrawn",
};

export function CandidateWorkspace({
  candidate,
  round,
  canManage,
  pool,
  demo,
  viewer,
  onBack,
  onChanged,
}: {
  candidate: Candidate;
  round: InterviewRound;
  canManage: boolean;
  pool: Reviewer[];
  demo: boolean;
  /** The signed-in interviewer, so their own notes can be marked as theirs. */
  viewer: string;
  onBack: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const kinds = ROUND_KINDS[round];
  const [kind, setKind] = useState<InterviewKind>(kinds[0]);
  // The first round is open: every member may score every candidate in it, panel
  // or no panel. The panel there records who is SCHEDULED with whom, and a
  // schedule written the day before should not decide whether a conversation that
  // already happened can be written down — an interview is run by whoever is
  // actually in the room.
  //
  // This mirrors `saveRubric`, which enforces the panel for the final round only.
  // It has to: a form that looks writable but 403s on save is worse than one that
  // is honestly read-only, and a form that is greyed out when the API would have
  // accepted it silently loses interviews. The final round needs no extra check
  // here because the route already limits it to exec, who always have canManage.
  const editable = round === "first_round" || candidate.assignedToMe || canManage;

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
          <h2 className="mt-1 flex flex-wrap items-center gap-2 font-display text-3xl font-extrabold text-[var(--bg-dark)]">
            {candidate.name}
            <FlagBadge flags={candidate.flags} />
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
          The final round is exec only, so this candidate&rsquo;s rubrics are read-only for you.
          You can still read the resume.
        </div>
      )}

      {canManage && (
        <PanelEditor candidate={candidate} round={round} pool={pool} demo={demo} onChanged={onChanged} />
      )}
      {canManage && <RoundDecision candidate={candidate} round={round} onChanged={onChanged} />}

      {/* Beside the resume, not below the rubrics: what someone noticed about this
          person at an info night is context for the conversation, and context is
          only useful before you score. Below the fold it would be read after. */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Flags</p>
          <p className="text-xs text-[var(--muted)]">
            {candidate.flags.length === 0
              ? "Nothing raised"
              : `${candidate.flags.length} on this candidate`}
          </p>
        </div>
        <FlagPanel
          applicantId={candidate.id}
          flags={candidate.flags}
          onChanged={onChanged}
          heading={false}
        />
      </div>

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

          <PanelScores candidate={candidate} kinds={kinds} />
        </div>
      </div>

      {/* Full width, and below the grid rather than squeezed into the rubric
          column beside it: these are paragraphs, and a paragraph in a half
          column at 12px is a paragraph nobody reads. */}
      <PanelNotes candidate={candidate} kinds={kinds} viewer={viewer} />
    </div>
  );
}

// ── What the panel wrote ─────────────────────────────────────────────────────

/**
 * Every interviewer's notes on this candidate, in this round.
 *
 * The scores table above says WHAT the panel thought; this says why. Grouped by
 * interviewer rather than by rubric, because a person's read of a candidate is
 * one thought that happens to be split across two sheets, and interleaving two
 * people's case notes makes both harder to follow.
 *
 * Notes from rounds other than this one are not here, and that is the same
 * scoping every other part of the board follows — the response never carries
 * another round's rubrics at all.
 */
function PanelNotes({
  candidate,
  kinds,
  viewer,
}: {
  candidate: Candidate;
  kinds: readonly InterviewKind[];
  viewer: string;
}) {
  const notes = candidate.panelNotes ?? [];

  // Yours first, then everyone else alphabetically. Not vanity: yours is the one
  // block you are checking rather than reading, and a stable place for it makes
  // that a glance instead of a search.
  const me = viewer.toLowerCase();
  const reviewers = [...new Set(notes.map((n) => n.reviewer))].sort((a, b) => {
    if ((a === me) !== (b === me)) return a === me ? -1 : 1;
    return a.localeCompare(b);
  });

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">What the panel wrote</p>
        <p className="text-xs text-[var(--muted)]">
          {notes.length === 0
            ? "Nothing written yet"
            : `${notes.length} note${notes.length === 1 ? "" : "s"} from ${reviewers.length} interviewer${reviewers.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {notes.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Notes an interviewer saves on their rubric show up here for everyone working this round —
          including notes written before the score off the paper sheet has been entered.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {reviewers.map((email) => {
            const theirs = notes.filter((n) => n.reviewer === email);
            return (
              <div key={email} className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/30 p-4">
                <p className="text-sm font-semibold text-[var(--bg-dark)]">
                  {email}
                  {email === me && (
                    <span className="ml-2 text-[11px] font-semibold text-[var(--gold-deep)]">you</span>
                  )}
                </p>
                <div className="mt-2.5 space-y-3">
                  {kinds
                    .map((k) => theirs.find((n) => n.kind === k))
                    .filter((n): n is PanelNote => Boolean(n))
                    .map((n) => (
                      <div key={n.kind}>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          <span>{KIND_LABEL[n.kind]}</span>
                          <span className="text-[var(--bg-dark)]">
                            {/* A note with no number yet is the normal state in
                                the hour after an interview, not an error. Say
                                which it is rather than printing a bare dash. */}
                            {n.total === null
                              ? "score not entered yet"
                              : `${formatScore(n.total)} / ${rubricMax(n.kind)}`}
                          </span>
                          {n.recommendation && (
                            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-[var(--bg-dark)]">
                              {recommendationLabel(n.recommendation)}
                            </span>
                          )}
                        </p>
                        {/* `whitespace-pre-wrap` so the interviewer's own line
                            breaks survive — these are typed as lists as often
                            as prose. */}
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg)]">
                          {n.notes}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Every interviewer's score ────────────────────────────────────────────────
// The candidate in one place: who has scored, what they gave, and what they
// recommended. Shown to everyone who can see the round — the first round is open
// to all members and the final round is exec-only long before this renders.

function PanelScores({
  candidate,
  kinds,
}: {
  candidate: Candidate;
  kinds: readonly InterviewKind[];
}) {
  const scores = candidate.panelScores;
  if (!scores) return null;

  // One row per interviewer, their rubrics across the columns, so a person's
  // whole view of the candidate reads on one line.
  const reviewers = [...new Set(scores.map((s) => s.reviewer))].sort();
  const standing = panelStanding(scores, kinds);

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--bg-dark)]">Panel scores</span>
        {standing.submissions > 0 && (
          <span className="text-xs text-[var(--muted)]">
            {standing.total === null
              ? "Both rubrics needed for a total"
              : `${formatScore(standing.total)} / ${standing.max}`}
            {standing.split && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                recommendations differ
              </span>
            )}
          </span>
        )}
      </div>

      {reviewers.length === 0 ? (
        <p className="mt-1 text-xs text-[var(--muted)]">Nobody has submitted a score yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[24rem] text-left text-xs">
            <thead>
              <tr className="text-[var(--muted)]">
                <th className="py-1 pr-3 font-medium">Interviewer</th>
                {kinds.map((k) => (
                  <th key={k} className="py-1 pr-3 font-medium">
                    {KIND_LABEL[k]} / {rubricMax(k)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewers.map((email) => {
                const rows = scores.filter((s) => s.reviewer === email);
                // Each rubric carries its OWN recommendation. They are allowed to
                // disagree — a candidate can crack the case and interview badly —
                // and collapsing them to one value threw half the verdict away.
                const recs = kinds.map((k) => rows.find((r) => r.kind === k)?.recommendation ?? null);
                const disagrees = new Set(recs.filter(Boolean)).size > 1;
                return (
                  <tr key={email} className="border-t border-[var(--border)] align-top">
                    <td className="py-1.5 pr-3 text-[var(--bg-dark)]">
                      {email}
                      {disagrees && (
                        <span className="ml-1.5 text-[11px] font-semibold text-amber-700">split</span>
                      )}
                    </td>
                    {kinds.map((k) => {
                      const hit = rows.find((r) => r.kind === k);
                      if (!hit) return <td key={k} className="py-1.5 pr-3 text-[var(--muted)]">—</td>;
                      return (
                        <td key={k} className="py-1.5 pr-3">
                          <span className="font-semibold text-[var(--bg-dark)]">{formatScore(hit.total)}</span>
                          <span className="block text-[11px] text-[var(--muted)]">
                            {recommendationLabel(hit.recommendation)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  const maxPoints = rubricMax(kind);
  const total = submittedTotal(kind, scores);
  // The behavioral sheet is half script, half grid; the case sheet is scored
  // against whatever case the panel runs, so it has no fixed questions.
  const questions = kind === "behavioral" || kind === "final_behavioral" ? BEHAVIORAL_QUESTIONS : null;
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
          Score {candidate.name.split(" ")[0]} on the {KIND_LABEL[kind]} rubric in their Drive
          folder, then enter the total here. Half points are allowed.
        </p>
        {othersDone > 0 && (
          <span className="shrink-0 text-xs text-[var(--muted)]">
            {othersDone} other {othersDone === 1 ? "panelist has" : "panelists have"} submitted
          </span>
        )}
      </div>

      <div className="mt-4">
        <label htmlFor={`total-${kind}`} className="text-sm font-semibold text-[var(--bg-dark)]">
          Total score
        </label>
        <div className="mt-2 flex items-center gap-2">
          <input
            id={`total-${kind}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={maxPoints}
            step={SCORE_STEP}
            disabled={!editable}
            value={scores[SCORE_KEY] ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              const next = { ...scores };
              // An empty box is "not scored yet", which is NOT the same as 0 —
              // 0 is every category unacceptable. Delete the key rather than
              // storing a zero, so a cleared field cannot submit as the harshest
              // possible review.
              if (raw === "") delete next[SCORE_KEY];
              else next[SCORE_KEY] = Number.parseFloat(raw);
              set<Record<string, number>>(setScores)(next);
            }}
            className="h-11 w-24 rounded-lg border border-[var(--border)] bg-white px-3 text-lg font-semibold text-[var(--bg-dark)] focus:border-[var(--gold)] focus:outline-none disabled:opacity-50"
          />
          <span className="text-lg font-semibold text-[var(--muted)]">/ {maxPoints}</span>
          {scores[SCORE_KEY] !== undefined && total === null && (
            <span className="text-xs text-amber-700">
              Must be between 0 and {maxPoints}, in steps of {SCORE_STEP}.
            </span>
          )}
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-soft,#faf9f7)] p-3">
        <summary className="cursor-pointer text-xs font-semibold text-[var(--bg-dark)]">
          {KIND_LABEL[kind]} rubric — {rubric.length} categories, {maxPoints} points
        </summary>
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
          The sheet in {candidate.name.split(" ")[0]}&rsquo;s Drive folder, for reference. Mark it
          up there; only the total comes back here.
        </p>
        {questions && (
          <div className="mt-3">
            <span className="text-xs font-semibold text-[var(--bg-dark)]">Questions, in order</span>
            <ol className="mt-1 space-y-1">
              {questions.map((q) => (
                <li key={q.n} className="text-[11px] leading-relaxed text-[var(--muted)]">
                  <span className="font-semibold text-[var(--bg-dark)]">{q.n}.</span> {q.text}
                  {q.category && (
                    <span className="ml-1 italic">
                      → {rubric.find((c) => c.key === q.category)?.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-3 space-y-3">
          {rubric.map((c) => (
            <div key={c.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold text-[var(--bg-dark)]">{c.label}</span>
                <span className="shrink-0 text-[11px] text-[var(--muted)]">out of {c.max}</span>
              </div>
              {c.prompts?.map((q) => (
                <p key={q} className="text-[11px] leading-relaxed text-[var(--muted)]">
                  {q}
                </p>
              ))}
              <ul className="mt-1 space-y-0.5">
                {c.levels.map((l) => (
                  <li key={l.label} className="text-[11px] leading-relaxed text-[var(--muted)]">
                    <span className="font-semibold text-[var(--bg-dark)]">
                      {l.min === l.max ? l.min : `${l.min}–${l.max}`} · {l.label}
                    </span>{" "}
                    {l.descriptor}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>

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
        // Said at the point of writing, not discovered afterwards. Notes are
        // read by everyone working this round, and someone who assumed they
        // were private has been misled by the interface rather than by anyone.
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          Everyone working this round can read these, under &ldquo;What the panel wrote&rdquo;.
        </p>
      )}

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
  const next = ROUND_ADVANCE[round];

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
          Advance → {next.label}
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
        {round === "first_round"
          ? "Who is scheduled to interview this candidate. It's a schedule, not a permission — every member can score any first-round candidate whether or not they're listed here."
          : "Whoever is listed here can fill in this candidate's final round rubrics — and only this candidate's, and only this round's."}{" "}
        The other round&rsquo;s panel is set separately and is unaffected.
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
