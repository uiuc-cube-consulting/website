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

// ── Other dimensions ─────────────────────────────────────────────────────────

/** What a cohort can be split by. Pronouns come from `responses`; the rest are
 *  mapped columns on the applicant. */
export type Dimension = "pronouns" | "major" | "college" | "year";

export const DIMENSION_LABEL: Record<Dimension, string> = {
  pronouns: "Pronouns",
  major: "Major",
  college: "College",
  year: "Year",
};

/**
 * Majors are free text, and people write the same one several ways. In the live
 * cycle "Finance + Data Science", "Finance + DS" and "Finance and Data Science"
 * are 34 people split across three rows — a chart built on the raw strings
 * reports the most common major as 25 when it is really 34, and buries the rest
 * among 99 values that appear exactly once.
 *
 * So a major is normalised to a canonical key before counting: separators are
 * unified, whole-token abbreviations are expanded, and the parts are sorted so
 * "CS + Econ" and "Econ + CS" are one thing.
 *
 * Expansion is whole-token only. A substring rule would turn "Design" into
 * "Data ScienceIGN" and "Meconomics" into nonsense — the kind of bug that is
 * invisible until someone reads a chart and cannot find their own major.
 */
const MAJOR_ALIASES: Record<string, string> = {
  cs: "computer science",
  ds: "data science",
  ie: "industrial engineering",
  ece: "electrical and computer engineering",
  ee: "electrical engineering",
  me: "mechanical engineering",
  econ: "economics",
  bio: "biology",
  stat: "statistics",
  stats: "statistics",
  is: "information science",
  math: "mathematics",
  acct: "accountancy",
  fin: "finance",
};

/** Known synonyms for the same college, so a one-person spelling does not
 *  become its own row. Typos are deliberately NOT corrected — a row reading
 *  "Division of Expletory Studies" is a data-entry problem worth seeing. */
const COLLEGE_ALIASES: Record<string, string> = {
  ischool: "school of information sciences",
  "college of liberal arts and sciences": "college of liberal arts & sciences",
  "college of fine and applied arts": "college of fine & applied arts",
};

const TITLE_MINOR = new Set(["and", "of", "the", "for"]);

/** Title-case for display, leaving small joining words lowercase. */
function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w, i) =>
      i > 0 && TITLE_MINOR.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(" ");
}

/** Canonical key for a free-text major. Returns "" for a blank. */
export function normalizeMajor(raw: string | null | undefined): string {
  const base = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!base) return "";
  const parts = base
    // "+", "&", "and", "/" and "," all mean the same thing between two majors.
    .split(/\s*(?:\+|&|,|\/|\band\b)\s*/)
    .map((p) => p.replace(/[.]/g, "").trim())
    .filter(Boolean)
    .map((p) => MAJOR_ALIASES[p] ?? p);
  if (!parts.length) return "";
  // Sorted, so a double major reads the same whichever order it was typed.
  return [...new Set(parts)].sort().join(" + ");
}

function normalizeCollege(raw: string | null | undefined): string {
  const base = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!base) return "";
  return COLLEGE_ALIASES[base] ?? base;
}

function normalizeYear(raw: string | null | undefined): string {
  return String(raw ?? "").trim().toLowerCase();
}

/** Raw value, canonical key, and display label for one dimension. */
function dimensionKey(a: Applicant, dimension: Dimension): { key: string; label: string } {
  if (dimension === "pronouns") {
    const g = pronounGroup(a.responses?.[PRONOUN_FIELD]);
    return { key: g, label: PRONOUN_LABEL[g] };
  }
  const raw = dimension === "major" ? a.major : dimension === "college" ? a.college : a.year;
  const key =
    dimension === "major"
      ? normalizeMajor(raw)
      : dimension === "college"
        ? normalizeCollege(raw)
        : normalizeYear(raw);
  if (!key) return { key: "unstated", label: "Not stated" };
  return { key, label: titleCase(key) };
}

export type GroupBreakdown = {
  /** Canonical key. A PronounGroup for pronouns; a normalised string otherwise. */
  group: string;
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
  dimension: Dimension;
  total: number;
  groups: GroupBreakdown[];
  /** Every stage present in the cohort, in the order the pipeline runs. */
  stages: string[];
  /** Distinct values before any top-N grouping — 146 majors is itself a finding. */
  distinct: number;
};

/** Beyond this many rows a chart stops being readable; the tail becomes "Other".
 *  Pronouns and year are naturally small and are never truncated. */
const DEFAULT_TOP_N = 12;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Split a cohort by any dimension, with each group's stage distribution and mean
 * written score.
 *
 * High-cardinality fields are truncated to the `topN` largest groups with the
 * remainder collapsed into "Other". Majors need it: 146 distinct values of which
 * 99 appear exactly once is not a chart, it is a list. The count of distinct
 * values is reported separately, because "146 different majors" is itself worth
 * knowing even when only twelve are drawn.
 *
 * `stageOrder` is passed in rather than imported so this module stays ignorant
 * of the pipeline's shape — the caller already knows STAGES, and a stage added
 * there should not need a second edit here.
 */
export function breakdownBy(
  dimension: Dimension,
  applicants: Applicant[],
  reviews: Review[],
  stageOrder: readonly string[],
  topN: number = DEFAULT_TOP_N
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

  const buckets = new Map<string, { label: string; members: Applicant[] }>();
  for (const a of applicants) {
    const { key, label } = dimensionKey(a, dimension);
    const cur = buckets.get(key);
    if (cur) cur.members.push(a);
    else buckets.set(key, { label, members: [a] });
  }
  const distinct = buckets.size;

  const present = new Set(applicants.map((a) => a.stage as string));
  const stages = stageOrder.filter((s) => present.has(s));

  const build = (key: string, label: string, members: Applicant[]): GroupBreakdown => {
    const byStage: Record<string, number> = {};
    for (const s of stages) byStage[s] = 0;
    for (const a of members) byStage[a.stage as string] = (byStage[a.stage as string] ?? 0) + 1;

    // Averaged over PEOPLE, not over reviews: a candidate read three times would
    // otherwise count for more than one read twice, quietly weighting the group
    // mean toward whoever happened to get an extra reviewer.
    const perPerson = members
      .map((a) => totalsByApplicant.get(a.id))
      .filter((t): t is number[] => Boolean(t?.length))
      .map((t) => t.reduce((x, y) => x + y, 0) / t.length);

    return {
      group: key,
      label,
      count: members.length,
      pct: applicants.length ? round1((members.length / applicants.length) * 100) : 0,
      reviewed: perPerson.length,
      meanScore: perPerson.length
        ? round1(perPerson.reduce((x, y) => x + y, 0) / perPerson.length)
        : null,
      byStage,
    };
  };

  let groups: GroupBreakdown[];
  if (dimension === "pronouns") {
    // Fixed order, so two charts of the same cohort never disagree, and never
    // truncated — the categories are few and each one matters.
    groups = PRONOUN_ORDER.filter((g) => buckets.has(g)).map((g) =>
      build(g, buckets.get(g)!.label, buckets.get(g)!.members)
    );
  } else {
    const sorted = [...buckets.entries()].sort(
      (a, b) => b[1].members.length - a[1].members.length || a[1].label.localeCompare(b[1].label)
    );
    const head = sorted.slice(0, topN);
    const tail = sorted.slice(topN);
    groups = head.map(([key, v]) => build(key, v.label, v.members));
    if (tail.length) {
      const rest = tail.flatMap(([, v]) => v.members);
      groups.push(build("__other__", `Other (${tail.length} more)`, rest));
    }
  }

  return { dimension, total: applicants.length, groups, stages, distinct };
}

/** Pronoun split — the original entry point, kept so callers reading gender
 *  balance do not have to name a dimension. */
export function demographicsReport(
  applicants: Applicant[],
  reviews: Review[],
  stageOrder: readonly string[]
): DemographicsReport {
  return breakdownBy("pronouns", applicants, reviews, stageOrder);
}
