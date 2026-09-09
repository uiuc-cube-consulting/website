// What a candidate was already scored, carried forward into the round they are
// in now. Pure — no server imports, safe in client components.
//
// The three rounds each score their own sheets and, until this module existed,
// each console showed only its own: the first-round panel could not see the
// written marks that put the candidate in front of them, and the final-round
// panel could not see either the written marks or the case and behavioral totals
// from the first round. Every round therefore judged one conversation in
// isolation, and the last one — the one that decides an offer — was the most
// isolated of all.
//
// Nothing new is stored for this. A round's scores are already rows in `reviews`
// keyed by `kind`, and a "prior round" is just the sheets of an earlier round
// read back (see `priorRounds` in ./rounds.ts). So history cannot drift from the
// scores it summarises — it IS the scores, grouped differently.
//
// Two deliberate limits:
//
//   · It reports what was recorded, never a judgement about it. There is no
//     combined "overall" number across rounds, because the rounds total to
//     different things out of different maxima (28 written, 32 first round, 12
//     second) and no arithmetic turns that into one honest figure. The panel
//     reads three numbers and weighs them; that is the job.
//
//   · The written round's blind-ish posture (see the applicants route) does NOT
//     apply here. It exists so two readers screening the SAME application at the
//     SAME time reach it independently — anchoring is only possible while the
//     round is open. Every candidate on an interview board has already left the
//     written round, so there is nothing left to anchor, and withholding the
//     detail then costs exactly what this module exists to restore.

import {
  KIND_LABEL,
  isInterviewKind,
  ROUND_KINDS,
  rubricMax,
  submittedTotal,
  type ReviewKind,
} from "./interview";
import { ROUND_LABEL, type Round } from "./rounds";
import {
  RUBRIC,
  SCREEN_MAX_POINTS,
  isScreenComplete,
  screenTotal,
  type RubricKey,
} from "./types";

/**
 * The scored sheets of each round — the written rubric for the written round,
 * and each interview round's own rubrics.
 *
 * ROUND_KINDS (./interview.ts) already says this for the two interview rounds;
 * this widens it to cover the written round too, so a caller walking the rounds
 * in order has one lookup rather than a special case for the first one.
 */
export const ROUND_SHEETS: Record<Round, readonly ReviewKind[]> = {
  written: ["screen"],
  first_round: ROUND_KINDS.first_round,
  final_round: ROUND_KINDS.final_round,
};

/** Every sheet in `rounds`, in round order. What a history query has to fetch. */
export function sheetsOfRounds(rounds: readonly Round[]): ReviewKind[] {
  return rounds.flatMap((r) => [...ROUND_SHEETS[r]]);
}

export function sheetLabel(kind: ReviewKind): string {
  return kind === "screen" ? "Written application" : KIND_LABEL[kind];
}

/** The highest score this sheet can award: written 28, case 15, behavioral 17,
 *  second round 12. */
export function sheetMax(kind: ReviewKind): number {
  return kind === "screen" ? SCREEN_MAX_POINTS : rubricMax(kind);
}

/**
 * The kind a stored row belongs to, or null when it has no live sheet.
 *
 * Two rows need translating. One written before `reviews.kind` existed carries
 * no kind at all and is a written screen (db/interview.sql defaulted the column
 * to 'screen' for exactly this reason, and ./types.ts `isScreenReview` reads an
 * absent kind the same way). One carrying a RETIRED kind — `final_case` /
 * `final_behavioral`, the pre-FA26 final round — has no rubric to be scored out
 * of any more, so it is dropped rather than shown against a maximum that never
 * applied to it. See db/rounds.sql for why those rows are kept but not migrated.
 */
export function sheetKind(kind: string | null | undefined): ReviewKind | null {
  if (!kind || kind === "screen") return "screen";
  return isInterviewKind(kind) ? kind : null;
}

/**
 * One row's total on its own sheet, or null when it does not carry one.
 *
 * The written branch asks for COMPLETENESS rather than summing what is there.
 * `screenTotal` treats a missing criterion as 0 so a half-filled draft still
 * shows a number in the form, which is right there and wrong here: a review
 * scored under the pre-FA26 written rubric (four 1–5 criteria, no `essay_1`)
 * would sum to a clean 0/28 and read as a devastating screen rather than as a
 * score on a rubric this one replaced. Null says the truthful thing — nothing on
 * this sheet — and db/rounds.sql explains why those rows were left in place.
 */
export function sheetTotal(
  kind: ReviewKind,
  scores: Record<string, number> | null | undefined
): number | null {
  if (kind === "screen") {
    const s = (scores ?? {}) as Partial<Record<RubricKey, number>>;
    return isScreenComplete(s) ? screenTotal(s) : null;
  }
  return submittedTotal(kind, scores ?? {});
}

/** A review row as history reads it — however it was fetched. */
export type HistoryRow = {
  reviewer_email: string;
  /** Absent on rows written before the column existed; see `sheetKind`. */
  kind?: string | null;
  scores?: Record<string, number> | null;
  notes?: string | null;
  recommendation?: string | null;
  created_at?: string | null;
};

/** One person's mark on one earlier sheet, with what they wrote beside it. */
export type PriorScore = {
  reviewer: string;
  kind: ReviewKind;
  label: string;
  /** Null when the row carries notes but no submitted total — see `sheetTotal`. */
  total: number | null;
  max: number;
  recommendation: string | null;
  notes: string;
  at: string | null;
};

/** One earlier sheet, averaged across whoever scored it. */
export type PriorSheet = {
  kind: ReviewKind;
  label: string;
  /** Mean of the totals recorded, or null when nobody has scored this sheet. */
  mean: number | null;
  /** How many people scored it. */
  n: number;
  max: number;
};

/** One earlier round, as the console shows it above the round being worked. */
export type PriorRound = {
  round: Round;
  label: string;
  sheets: PriorSheet[];
  /** Sum of the sheet means, or null until every sheet in the round has one. */
  total: number | null;
  max: number;
  /** Everyone who scored or wrote in this round, alphabetically. */
  reviewers: string[];
  scores: PriorScore[];
  /**
   * The written round only: the mean each criterion earned.
   *
   * Carried because it is the one place a single number genuinely hides the
   * answer. "21/28" and "21/28 with 3/7 on the case essay" are different
   * candidates to a panel about to run a case, and the criteria are already on
   * the row — nothing extra is read to say so.
   */
  criteria?: { key: RubricKey; label: string; max: number; mean: number | null }[];
};

/** Two decimal places, which is as fine as any of these rubrics is ever read —
 *  and enough to keep a sum of means off 26.830000000000002. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(values: readonly number[]): number | null {
  if (!values.length) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Group one candidate's review rows into the earlier rounds they belong to.
 *
 * `rounds` is what the caller asked for — `priorRounds(round)` at every call
 * site — and a round with nothing recorded is still RETURNED, empty. That is
 * deliberate: a candidate sitting in the final round with no written score on
 * file is a fact worth seeing (somebody advanced them by hand), and a card that
 * says "not scored" says it, where an omitted round is indistinguishable from a
 * console that never looked.
 *
 * Rows outside `rounds` are ignored, which is what keeps the round being worked
 * out of its own history, and a retired kind out of everything.
 *
 * The mean-per-sheet-then-sum shape mirrors `panelStanding` (./interview.ts) and
 * for the same reasons: two interviewers scoring one case produce one case score
 * rather than a doubled one, and two sheets measuring different things are added
 * rather than averaged. It stays a separate function because that one also
 * decides whether the LIVE round's recommendations are split — a question with
 * no meaning about a round that already ended in a decision.
 */
export function historyFrom(
  rows: readonly HistoryRow[],
  rounds: readonly Round[]
): PriorRound[] {
  return rounds.map((round) => {
    const kinds = ROUND_SHEETS[round];
    const scores: PriorScore[] = [];

    for (const row of rows) {
      const kind = sheetKind(row.kind);
      if (!kind || !kinds.includes(kind)) continue;
      const total = sheetTotal(kind, row.scores);
      const notes = (row.notes ?? "").trim();
      // A row that carries neither a total nor a sentence is an empty draft;
      // listing the reviewer with nothing under their name reads as a failure to
      // load rather than as somebody who has not scored yet.
      if (total === null && !notes) continue;
      scores.push({
        reviewer: String(row.reviewer_email).toLowerCase(),
        kind,
        label: sheetLabel(kind),
        total,
        max: sheetMax(kind),
        recommendation: row.recommendation ?? null,
        notes,
        at: row.created_at ?? null,
      });
    }

    const sheets: PriorSheet[] = kinds.map((kind) => {
      const totals = scores
        .filter((s) => s.kind === kind && s.total !== null)
        .map((s) => s.total as number);
      return { kind, label: sheetLabel(kind), mean: mean(totals), n: totals.length, max: sheetMax(kind) };
    });

    const scored = sheets.filter((s) => s.mean !== null);
    return {
      round,
      label: ROUND_LABEL[round],
      sheets,
      // Null until every sheet has a score, exactly as `panelStanding` does it: a
      // partial sum shown against the full maximum reads as a rejection, since a
      // strong candidate with only the case in looks like 12/32.
      total:
        scored.length === sheets.length
          ? round2(scored.reduce((a, s) => a + (s.mean ?? 0), 0))
          : null,
      max: sheets.reduce((a, s) => a + s.max, 0),
      reviewers: [...new Set(scores.map((s) => s.reviewer))].sort(),
      scores,
      criteria: round === "written" ? writtenCriteria(rows) : undefined,
    };
  });
}

/**
 * Per-criterion means for the written round.
 *
 * Presence, not truthiness — a scored 0 (an unanswered essay) belongs in the
 * mean and a criterion nobody filled in does not. This is the same rule
 * `aggregate` in ./types.ts applies across a whole cohort; here it is one
 * candidate's rows, already in hand.
 */
function writtenCriteria(
  rows: readonly HistoryRow[]
): { key: RubricKey; label: string; max: number; mean: number | null }[] {
  const screens = rows.filter((r) => sheetKind(r.kind) === "screen");
  return RUBRIC.map((c) => {
    const vals = screens
      .map((r) => Number(r.scores?.[c.key]))
      .filter((v) => Number.isFinite(v) && v >= 0 && v <= c.max);
    return { key: c.key, label: c.label, max: c.max, mean: mean(vals) };
  });
}

/** True when any earlier round has something recorded — the UI's empty check. */
export function hasHistory(history: readonly PriorRound[] | undefined): boolean {
  return Boolean(history?.some((h) => h.scores.length > 0));
}
