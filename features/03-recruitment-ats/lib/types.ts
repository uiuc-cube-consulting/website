// Pure domain types + the calibrated rubric + scoring/aggregation helpers.
// No server imports — safe to use from client components.

export const STAGES = [
  "applied",
  "screened",
  "interview",
  "offer",
  "accepted",
] as const;
export type Stage = (typeof STAGES)[number] | "rejected" | "withdrawn";

/** Stages that form the conversion funnel (excludes terminal rejected/withdrawn). */
export const FUNNEL_STAGES: Stage[] = [...STAGES];
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]));

// ── Calibrated rubric ────────────────────────────────────────────────────────
// Fixed criteria, each 1–5 with written anchors so a "4" means the same to every
// reviewer. Equal weights by default — tune `weight` to reweight.
export const RUBRIC = [
  {
    key: "problem_solving",
    label: "Problem-solving",
    weight: 1,
    anchor: "Structures ambiguous problems; reasons from first principles.",
  },
  {
    key: "communication",
    label: "Communication",
    weight: 1,
    anchor: "Clear, concise, audience-aware; listens and synthesizes.",
  },
  {
    key: "drive",
    label: "Drive & initiative",
    weight: 1,
    anchor: "Self-starts, follows through, seeks ownership.",
  },
  {
    key: "fit",
    label: "Team fit",
    weight: 1,
    anchor: "Collaborative, coachable, raises the people around them.",
  },
] as const;

export type RubricKey = (typeof RUBRIC)[number]["key"];
export type Scores = Record<RubricKey, number>; // each 1–5

export type Applicant = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  year?: string;
  major?: string;
  college?: string;
  responses: Record<string, string>;
  stage: Stage;
};

export type Review = {
  id: string;
  created_at: string;
  applicant_id: string;
  reviewer_email: string;
  scores: Scores;
  weighted_total: number;
  notes?: string;
};

/** Weighted average of a single review's criterion scores, on the 1–5 scale. */
export function weightedTotal(scores: Scores): number {
  const totalWeight = RUBRIC.reduce((a, r) => a + r.weight, 0);
  const sum = RUBRIC.reduce((a, r) => a + (Number(scores[r.key]) || 0) * r.weight, 0);
  return totalWeight ? Math.round((sum / totalWeight) * 100) / 100 : 0;
}

export type ApplicantAggregate = {
  applicant: Applicant;
  reviewCount: number;
  mean: number | null; // mean of reviewers' weighted totals
  spread: number | null; // max - min weighted total (calibration signal)
  perCriterion: Record<RubricKey, number | null>;
  reviewers: string[];
};

/** Aggregate a set of reviews for one applicant: mean, spread, per-criterion means. */
export function aggregate(applicant: Applicant, reviews: Review[]): ApplicantAggregate {
  const rs = reviews.filter((r) => r.applicant_id === applicant.id);
  const totals = rs.map((r) => r.weighted_total);
  const mean = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : null;
  const spread = totals.length ? Math.round((Math.max(...totals) - Math.min(...totals)) * 100) / 100 : null;

  const perCriterion = Object.fromEntries(
    RUBRIC.map((r) => {
      const vals = rs.map((rv) => Number(rv.scores[r.key]) || 0).filter((v) => v > 0);
      const m = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      return [r.key, m];
    })
  ) as Record<RubricKey, number | null>;

  return {
    applicant,
    reviewCount: rs.length,
    mean,
    spread,
    perCriterion,
    reviewers: rs.map((r) => r.reviewer_email),
  };
}

export function stageRank(stage: Stage): number {
  return STAGE_ORDER[stage] ?? -1;
}

export type Funnel = { stage: Stage; count: number; reached: number }[];

/** Funnel counts: how many applicants are at, and have reached, each stage. */
export function funnel(applicants: Applicant[]): Funnel {
  return FUNNEL_STAGES.map((stage) => {
    const idx = stageRank(stage);
    const count = applicants.filter((a) => a.stage === stage).length;
    const reached = applicants.filter((a) => stageRank(a.stage) >= idx && a.stage !== "rejected" && a.stage !== "withdrawn").length;
    return { stage, count, reached };
  });
}
