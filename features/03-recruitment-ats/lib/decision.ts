// The exec decision queue: every candidate's written reviews, unblinded, once
// enough people have weighed in. Pure — no I/O, safe in client components.
//
// This is deliberately a SEPARATE view from the reviewer feed in
// app/api/recruitment/applicants, which shows a reviewer only their own scores
// and never anyone else's. That blindness is the point during the screen: a
// reviewer who can see an existing 4 anchors to it. Once both reads are in,
// blindness has done its job and exec needs the opposite — both verdicts side by
// side, including where they disagree.
//
// So: the reviewer feed stays blind, and this queue is exec-only.

import {
  RUBRIC,
  SCREEN_MAX_POINTS,
  isScreenReview,
  screenTotal,
  type Applicant,
  type Review,
  type RubricKey,
} from "./types";
import { MIN_REVIEWERS_PER_APPLICANT } from "./assignment";

/**
 * Spread (max − min of the reviewers' point totals) at which two reads stop being
 * noise and start being a genuine disagreement worth a human look.
 *
 * A quarter of the whole scale — 7 of 28 points — is roughly "one reviewer said
 * yes and the other said no": a 21 against a 14. Below that the two are arguing
 * about degree; above it they are arguing about the decision, and exec should read
 * the notes rather than the mean. The mean of a 25 and an 11 is a perfectly
 * ordinary-looking 18, so without this flag the most contested candidates are the
 * easiest to skim past.
 *
 * Derived from SCREEN_MAX_POINTS rather than written as a literal, so reweighting
 * the rubric moves the threshold with it instead of leaving a constant that
 * silently means something different.
 */
export const DISAGREEMENT_THRESHOLD = Math.round(SCREEN_MAX_POINTS * 0.25);

export type ReviewerVerdict = {
  reviewer_email: string;
  scores: Record<string, number>;
  weighted_total: number;
  notes: string;
  submitted_at?: string;
};

export type DecisionRow = {
  applicant: Applicant;
  /** Every written-application review, unblinded, strongest first. */
  verdicts: ReviewerVerdict[];
  reviewCount: number;
  mean: number | null;
  spread: number | null;
  perCriterion: Record<RubricKey, number | null>;
  /** Enough independent reads to decide on. */
  ready: boolean;
  /** Reviewers materially disagree — read the notes, not the mean. */
  disagreement: boolean;
  /** Reviews still owed before this candidate is decidable. */
  awaiting: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One row per applicant, with the written reviews unblinded.
 *
 * `minReviews` is injected rather than read from the constant so the caller can
 * ask "what would be ready at 3?" without this module knowing about policy.
 */
export function buildDecisionQueue(
  applicants: Applicant[],
  reviews: Review[],
  minReviews: number = MIN_REVIEWERS_PER_APPLICANT
): DecisionRow[] {
  const byApplicant = new Map<string, Review[]>();
  for (const r of reviews) {
    // Interview rubrics belong to the first and final rounds and score a
    // different scale entirely; only the written application decides this queue.
    if (!isScreenReview(r)) continue;
    const cur = byApplicant.get(r.applicant_id);
    if (cur) cur.push(r);
    else byApplicant.set(r.applicant_id, [r]);
  }

  return applicants.map((applicant) => {
    const rs = byApplicant.get(applicant.id) ?? [];

    const verdicts: ReviewerVerdict[] = rs
      .map((r) => ({
        reviewer_email: r.reviewer_email,
        scores: r.scores as Record<string, number>,
        // Recompute rather than trust the stored column: a rubric change would
        // otherwise leave old rows sorting against a total that no longer means
        // anything. Points out of SCREEN_MAX_POINTS.
        weighted_total: screenTotal(r.scores),
        notes: r.notes ?? "",
        submitted_at: r.created_at,
      }))
      .sort((a, b) => b.weighted_total - a.weighted_total);

    const totals = verdicts.map((v) => v.weighted_total);
    const mean = totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
    const spread = totals.length > 1 ? round2(Math.max(...totals) - Math.min(...totals)) : null;

    const perCriterion = Object.fromEntries(
      RUBRIC.map((c) => {
        // Presence, not truthiness: 0 is a real score on this rubric (an
        // unanswered essay), and dropping zeros would flatter every weak answer.
        const vals = verdicts.map((v) => Number(v.scores?.[c.key])).filter((n) => Number.isFinite(n));
        return [c.key, vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null];
      })
    ) as Record<RubricKey, number | null>;

    return {
      applicant,
      verdicts,
      reviewCount: verdicts.length,
      mean,
      spread,
      perCriterion,
      ready: verdicts.length >= minReviews,
      disagreement: spread !== null && spread >= DISAGREEMENT_THRESHOLD,
      awaiting: Math.max(0, minReviews - verdicts.length),
    };
  });
}

export type QueueOrder = "score" | "disagreement" | "name";

/**
 * Order the queue for a human working through it.
 *
 * Ready candidates always come first: exec is here to decide, and a candidate
 * still awaiting a second read is not decidable no matter how good the one score
 * is. Within that, "score" is the default because deciding in rank order makes
 * the cutoff visible as you go.
 */
export function sortDecisionQueue(rows: DecisionRow[], order: QueueOrder = "score"): DecisionRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    if (order === "disagreement") {
      if (a.disagreement !== b.disagreement) return a.disagreement ? -1 : 1;
      return (b.spread ?? -1) - (a.spread ?? -1);
    }
    if (order === "name") return a.applicant.name.localeCompare(b.applicant.name);
    return (b.mean ?? -1) - (a.mean ?? -1);
  });
  return out;
}

export type QueueSummary = {
  total: number;
  ready: number;
  awaitingReviews: number;
  disagreements: number;
  /** Ready, and no decision recorded yet — the actual work left. */
  undecided: number;
};

export function summarizeQueue(rows: DecisionRow[], decidedIds: Set<string> = new Set()): QueueSummary {
  const ready = rows.filter((r) => r.ready);
  return {
    total: rows.length,
    ready: ready.length,
    awaitingReviews: rows.length - ready.length,
    disagreements: ready.filter((r) => r.disagreement).length,
    undecided: ready.filter((r) => !decidedIds.has(r.applicant.id)).length,
  };
}
