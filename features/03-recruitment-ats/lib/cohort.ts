// Which round a candidate actually REACHED, as opposed to which one they are
// sitting in right now.
//
// Pure — no server imports, safe in client components.
//
// The problem this solves: `applicants.stage` holds one value, the current one.
// The moment exec rejects someone after their first-round interview, their stage
// becomes `rejected` and every trace of how far they got disappears from that
// column. So "the first-round cohort" cannot be read as `stage = 'interview'`
// once decisions have been made — after a cycle finishes that query returns
// nobody, and a demographics page built on it would report that the first round
// had no candidates at all.
//
// There is no stage-history table to consult (`decisions` is keyed by applicant
// and upserted, so it holds the LAST decision, not the sequence). So reach is
// INFERRED from the evidence a round leaves behind:
//
//   · the candidate's stage is at or past that round, or
//   · somebody scored one of that round's rubrics for them, or
//   · they were put on that round's interview panel.
//
// The three are OR'd because each covers the others' gap. Stage alone loses
// everyone already decided on. Reviews alone lose the candidate who was
// scheduled and no-showed, and the one whose interviewer never wrote the score
// down. The panel alone loses candidates interviewed by whoever was actually in
// the room rather than whoever was rostered — which the first round explicitly
// allows (see `saveRubric`).
//
// Inference has a limit and it is worth stating: a candidate advanced into a
// round and then rejected without ever being scheduled or scored is
// indistinguishable here from one rejected before it. If that distinction ever
// has to be exact, the fix is a stage-history table written on every decision,
// not a cleverer guess — and it can only start counting from the day it ships,
// which is why this module exists for the cycles that came before it.

import { INTERVIEW_ROUNDS, ROUND_STAGES, type InterviewRound, type Round } from "./rounds";
import type { Applicant, Review, Stage } from "./types";

/** The rubric kinds each interview round is scored on. Mirrors ROUND_KINDS in
 *  ./interview.ts, kept here as strings so this module stays free of it. */
const ROUND_REVIEW_KINDS: Record<InterviewRound, readonly string[]> = {
  first_round: ["case", "behavioral"],
  final_round: ["final_case", "final_behavioral"],
};

/**
 * Stages that mean "at or past this round".
 *
 * Terminal stages are deliberately absent: `rejected` says nothing about how far
 * someone got, which is the entire reason this module exists.
 */
const AT_OR_PAST: Record<InterviewRound, readonly Stage[]> = {
  first_round: ["interview", "final_round", "offer", "accepted"],
  final_round: ["final_round", "offer", "accepted"],
};

/**
 * Who was seen in each interview round, gathered once so the per-applicant
 * questions below are set lookups rather than a scan of every review.
 *
 * `panel` is optional because most callers read `getSnapshot`, which does not
 * fetch panels. Leaving it out costs only the no-show case.
 */
export type RoundEvidence = {
  reviewed: Record<InterviewRound, Set<string>>;
  paneled: Record<InterviewRound, Set<string>>;
};

export function gatherEvidence(
  reviews: readonly Pick<Review, "applicant_id" | "kind">[],
  panel: readonly { applicant_id: string; round?: string | null }[] = []
): RoundEvidence {
  const evidence: RoundEvidence = {
    reviewed: { first_round: new Set(), final_round: new Set() },
    paneled: { first_round: new Set(), final_round: new Set() },
  };

  for (const r of reviews) {
    for (const round of INTERVIEW_ROUNDS) {
      if (ROUND_REVIEW_KINDS[round].includes(String(r.kind))) {
        evidence.reviewed[round].add(r.applicant_id);
      }
    }
  }
  for (const p of panel) {
    // Rows written before db/rounds.sql added the column are first-round panels,
    // which is exactly what that migration's DEFAULT says.
    const round = (p.round ?? "first_round") as InterviewRound;
    if (round === "first_round" || round === "final_round") {
      evidence.paneled[round].add(p.applicant_id);
    }
  }
  return evidence;
}

/** Did this candidate reach `round` at any point? */
export function reachedRound(
  applicant: Pick<Applicant, "id" | "stage">,
  round: InterviewRound,
  evidence: RoundEvidence
): boolean {
  return (
    AT_OR_PAST[round].includes(applicant.stage) ||
    evidence.reviewed[round].has(applicant.id) ||
    evidence.paneled[round].has(applicant.id)
  );
}

/**
 * The deepest round this candidate got to. Everyone reached the written round —
 * that is what applying is — so this never returns null.
 */
export function deepestRound(
  applicant: Pick<Applicant, "id" | "stage">,
  evidence: RoundEvidence
): Round {
  if (reachedRound(applicant, "final_round", evidence)) return "final_round";
  if (reachedRound(applicant, "first_round", evidence)) return "first_round";
  return "written";
}

/**
 * The cohort of a round: everyone who reached it, whatever became of them since.
 *
 * This is the population a round's demographics are ABOUT. "Who was in the first
 * round" has to keep including the people the first round turned down, or the
 * report answers a question nobody asked — the whole point of splitting a cohort
 * by pronouns or major is to compare who went in against who came out.
 */
export function cohortOf(
  round: Round,
  applicants: readonly Applicant[],
  evidence: RoundEvidence
): Applicant[] {
  if (round === "written") return [...applicants];
  return applicants.filter((a) => reachedRound(a, round, evidence));
}

/**
 * Candidates this round turned down: they reached it, and they are out.
 *
 * `rejected` and `withdrawn` are both terminal but they are not the same event —
 * one is our decision and the other is theirs — so a withdrawal is not reported
 * as a rejection. Callers wanting both can ask twice.
 */
export function rejectedAfter(
  round: Round,
  applicants: readonly Applicant[],
  evidence: RoundEvidence
): Applicant[] {
  return applicants.filter(
    (a) => a.stage === "rejected" && deepestRound(a, evidence) === round
  );
}

/** Stages that put a candidate at or past `round`, for callers that want the
 *  live query rather than the historical cohort. */
export function stagesAtOrPast(round: InterviewRound): readonly Stage[] {
  return AT_OR_PAST[round];
}

/** Sanity: every interview round's entry stage is one of its at-or-past stages.
 *  Exported for the test that pins the two lists together. */
export function entryStageIsCovered(round: InterviewRound): boolean {
  return ROUND_STAGES[round].every((s) => AT_OR_PAST[round].includes(s));
}
