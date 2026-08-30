// Who is applying, and whether the process treats them the same.
// Pure — no server imports, safe in client components.
//
// The form asks for PRONOUNS, not gender, and this module reports what was
// actually collected rather than inferring a category nobody was asked for.
// That is not pedantry: pronouns are self-reported and unambiguous, whereas
// guessing gender from a first name is both unreliable and something the
// applicant never consented to. A person who puts "they/them" is counted as
// they/them, not rounded into a binary to make a chart tidier.
//
// The counts are the least interesting part. The reason this is worth building
// is the SPLIT ACROSS STAGES and the mean score per group: a cohort that is 26%
// she/her at application and 10% at offer is telling you something about the
// process that a headline number never will.

import type { Applicant, Review } from "./types";
import { isScreenReview, screenTotal } from "./types";

/** The response-sheet column this reads. Stored in `responses` because the
 *  import maps only name/email/year/major/college/resume into columns. */
export const PRONOUN_FIELD = "Pronouns";

export type PronounGroup = "she" | "he" | "they" | "other" | "unstated";

export const PRONOUN_LABEL: Record<PronounGroup, string> = {
  she: "she/her",
  he: "he/him",
  they: "they/them",
  other: "Other",
  unstated: "Not stated",
};

/** Order used everywhere this is displayed, so two charts never disagree. */
export const PRONOUN_ORDER: PronounGroup[] = ["she", "he", "they", "other", "unstated"];

/**
 * Bucket a free-text pronoun answer.
 *
 * Substring matching on the subject pronoun, because people write "she/her",
 * "She/Her/Hers", "she / her" and "she/they" and all of them mean the first
 * thing. Checked in order: an answer containing BOTH "she" and "they" is
 * counted as she/her, since that is the pronoun listed first and the one the
 * person led with — the alternative is a combinatorial explosion of buckets
 * that nobody can read.
 *
 * Anything present but unrecognised is `other` rather than `unstated`: those are
 * different facts, and collapsing them would hide that somebody answered.
 */
export function pronounGroup(raw: string | null | undefined): PronounGroup {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "unstated";
  if (/\bshe\b/.test(v)) return "she";
  if (/\bhe\b/.test(v)) return "he";
  if (/\bthey\b/.test(v)) return "they";
  return "other";
}

export type GroupBreakdown = {
  group: PronounGroup;
  label: string;
  count: number;
  /** Share of the cohort, 0–100, one decimal. */
  pct: number;
  /** Applicants in this group with at least one written review. */
  reviewed: number;
  /** Mean written score across reviewed applicants, or null if none are. */
  meanScore: number | null;
  /** How many sit at each stage. */
  byStage: Record<string, number>;
};

export type DemographicsReport = {
  total: number;
  groups: GroupBreakdown[];
  /** Every stage present in the cohort, in the order the pipeline runs. */
  stages: string[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Split a cohort by pronouns, with each group's stage distribution and mean
 * written score.
 *
 * `stageOrder` is passed in rather than imported so this module stays ignorant
 * of the pipeline's shape — the caller already knows STAGES, and a stage added
 * there should not need a second edit here.
 */
export function demographicsReport(
  applicants: Applicant[],
  reviews: Review[],
  stageOrder: readonly string[]
): DemographicsReport {
  // One pass over reviews: applicant -> their written totals.
  const totalsByApplicant = new Map<string, number[]>();
  for (const r of reviews) {
    if (!isScreenReview(r)) continue;
    const cur = totalsByApplicant.get(r.applicant_id);
    // Recomputed from `scores` rather than trusting `weighted_total`, for the
    // same reason the decision queue recomputes it: a rubric change leaves the
    // stored column meaning something that no longer matches the criteria.
    const total = screenTotal(r.scores);
    if (cur) cur.push(total);
    else totalsByApplicant.set(r.applicant_id, [total]);
  }

  const buckets = new Map<PronounGroup, Applicant[]>();
  for (const a of applicants) {
    const g = pronounGroup(a.responses?.[PRONOUN_FIELD]);
    const cur = buckets.get(g);
    if (cur) cur.push(a);
    else buckets.set(g, [a]);
  }

  const present = new Set(applicants.map((a) => a.stage as string));
  const stages = stageOrder.filter((s) => present.has(s));

  const groups: GroupBreakdown[] = PRONOUN_ORDER
    .filter((g) => buckets.has(g))
    .map((group) => {
      const members = buckets.get(group)!;
      const byStage: Record<string, number> = {};
      for (const s of stages) byStage[s] = 0;
      for (const a of members) byStage[a.stage as string] = (byStage[a.stage as string] ?? 0) + 1;

      // Averaged over PEOPLE, not over reviews: a candidate read three times
      // would otherwise count for more than one read twice, quietly weighting
      // the group mean toward whoever happened to get an extra reviewer.
      const perPerson = members
        .map((a) => totalsByApplicant.get(a.id))
        .filter((t): t is number[] => Boolean(t?.length))
        .map((t) => t.reduce((x, y) => x + y, 0) / t.length);

      return {
        group,
        label: PRONOUN_LABEL[group],
        count: members.length,
        pct: applicants.length ? round1((members.length / applicants.length) * 100) : 0,
        reviewed: perPerson.length,
        meanScore: perPerson.length
          ? round1(perPerson.reduce((x, y) => x + y, 0) / perPerson.length)
          : null,
        byStage,
      };
    });

  return { total: applicants.length, groups, stages };
}
