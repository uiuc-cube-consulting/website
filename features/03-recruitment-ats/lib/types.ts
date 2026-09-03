// Pure domain types + the written-application rubric + scoring/aggregation
// helpers. No server imports — safe to use from client components.
//
// The cycle runs in three rounds, and this module owns the FIRST one. See
// ./rounds.ts for the round model itself and which stages belong to which round:
//   · written      — the application + resume, scored on RUBRIC below
//   · first_round  — case + behavioral interviews (./interview.ts)
//   · final_round  — exec-only final interviews (./interview.ts)

export const STAGES = [
  "applied",
  "screened",
  "interview",
  "final_round",
  "offer",
  "accepted",
] as const;
export type Stage = (typeof STAGES)[number] | "rejected" | "withdrawn";

/** Stages that form the conversion funnel (excludes terminal rejected/withdrawn). */
export const FUNNEL_STAGES: Stage[] = [...STAGES];
const STAGE_ORDER: Record<string, number> = Object.fromEntries(STAGES.map((s, i) => [s, i]));

// ── Written-application rubric ───────────────────────────────────────────────
// The scored parts of a written application, as POINTS rather than a 1–5 scale.
// Each criterion carries its own ceiling — the case essay is worth more than a
// short-answer essay, and the rubric says so directly instead of hiding the
// difference in a weight — and the totals reviewers compare are plain sums out
// of SCREEN_MAX_POINTS.
//
// Zero is a real score, not "unscored": an unanswered essay earns 0 points. So
// completeness is "every criterion has a value", never "every value is above
// zero" — see isScreenComplete.
//
// The interview rubrics in ./interview.ts now share this shape — points out of a
// per-criterion ceiling — because the paper sheets they mirror are scored that
// way too. The two rounds still score different things out of different totals
// (28 written, 15 case, 17 behavioral) and their numbers are never mixed together
// (see `aggregate`).
export const RUBRIC = [
  {
    key: "essay_1",
    label: "Essay 1",
    max: 5,
    anchor:
      "5 = specific, self-aware, and unmistakably about this person; 3 = answers the prompt but could be anyone's; 0 = unanswered or off-prompt.",
  },
  {
    key: "essay_2",
    label: "Essay 2",
    max: 3,
    anchor: "3 = concrete and well-argued; 2 = fine but generic; 0 = unanswered or off-prompt.",
  },
  {
    key: "essay_3",
    label: "Essay 3",
    max: 3,
    anchor: "3 = concrete and well-argued; 2 = fine but generic; 0 = unanswered or off-prompt.",
  },
  {
    key: "case_essay",
    label: "Case essay",
    max: 7,
    anchor:
      "The heaviest single item. 7 = structured, quantified, and lands a recommendation; 4 = sound reasoning without a clear answer; 1–2 = unstructured; 0 = unanswered.",
  },
  {
    key: "misc",
    label: "Miscellaneous",
    max: 5,
    anchor:
      "Everything the essays don't capture: involvement, writing quality, evidence of follow-through, anything notable in the rest of the form.",
  },
  {
    key: "resume",
    label: "Resume",
    max: 5,
    anchor:
      "5 = relevant experience with real ownership, cleanly presented; 3 = solid but thin; 0 = no resume submitted.",
  },
] as const;

export type RubricKey = (typeof RUBRIC)[number]["key"];
/** Each criterion scored 0..its own `max`. */
export type Scores = Record<RubricKey, number>;

/** Shape of one written-application criterion, for helpers that take any of them. */
export type PointCriterion = { key: string; label: string; max: number; anchor: string };

/** The best possible written application: 5 + 3 + 3 + 7 + 5 + 5 = 28. */
export const SCREEN_MAX_POINTS: number = RUBRIC.reduce((a, c) => a + c.max, 0);

/**
 * One column of the paper interview rubric — the band of scores a description
 * earns.
 *
 * `min` and `max` are usually equal: on the case rubric each column is worth
 * exactly one number. They differ where the paper rubric says "points are
 * increased per box" and gives a range instead ("[3-4]", "[4-5]"), which is how
 * the behavioral rubric makes Goals and Competence count for more than the
 * categories beside them.
 */
export type RubricLevel = {
  min: number;
  max: number;
  /** The column heading: "Exceeds Expectations", "Below Average", … */
  label: string;
  /** What that column describes, transcribed from the paper rubric. */
  descriptor: string;
};

/**
 * Shape shared by the interview rubrics in `interview.ts`.
 *
 * Points, not a normalised scale. Each criterion carries its own ceiling, for
 * the same reason the written rubric above does: the behavioral rubric really is
 * worth 5 points on Competence and 2 on Presentation, and saying so directly is
 * both what the paper rubric does and what an interviewer expects to see. The
 * total is a plain sum out of `rubricMaxPoints`, so a score in the portal and a
 * score on the printed sheet are the same number.
 *
 * Zero is a real score here, exactly as on the written rubric — "Unacceptable
 * Answer" is a column on both sheets, not the absence of one — so completeness
 * is "every criterion has a value", never "every value is above zero".
 */
export type RubricCriterion = {
  key: string;
  label: string;
  /** Highest score this criterion can earn. Not uniform across a rubric. */
  max: number;
  /** The sub-questions printed under the category name, if any. */
  prompts?: readonly string[];
  /** One-line summary, shown beside the score buttons where the grid won't fit. */
  anchor: string;
  /** The grid's columns, highest band first. */
  levels: readonly RubricLevel[];
};

/**
 * A whole number within this criterion's 0..max range.
 *
 * Deliberately does NOT coerce. `Number(null)` is 0 and `Number("")` is 0, so a
 * coercing check would read a criterion the reviewer never touched as a scored
 * zero — and on this rubric zero is a real, meaningful score, so that mistake is
 * invisible: an unfinished review would submit and count as a harsh one. JSON
 * numbers arrive as numbers, so requiring one costs nothing.
 */
export function isValidScore(criterion: PointCriterion, value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= criterion.max
  );
}

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
  /**
   * The semester this application belongs to — "fa26", "sp27". Part of the
   * application's identity, not a label on it: uniqueness is (lower(email),
   * cycle), so one person holds one application per cycle and as many cycles as
   * they apply in. See lib/cycle.ts for the format and db/cycles.sql for the
   * constraint.
   *
   * `stage` and `cycle` are orthogonal and easy to confuse: stage is where a
   * candidate got to WITHIN one cycle, cycle is WHICH attempt it was. Someone
   * rejected in fa26 and interviewing in sp27 has two rows, each with its own
   * stage.
   */
  cycle: string;
};

export type Review = {
  id: string;
  created_at: string;
  applicant_id: string;
  reviewer_email: string;
  scores: Scores;
  /** Column name is historical: nothing is weighted any more. For a screen review
   *  this holds POINTS out of SCREEN_MAX_POINTS; for an interview rubric, points
   *  out of that rubric's own total (case 15, behavioral 17). */
  weighted_total: number;
  notes?: string;
  /** Which rubric this row is an instance of, which is also which ROUND it
   *  belongs to (see ./rounds.ts). Absent on rows written before the interview
   *  console existed, which are all written-application screens. */
  kind?: "screen" | "case" | "behavioral" | "final_case" | "final_behavioral";
  recommendation?: string | null;
};

/** The best possible score on an interview rubric: case = 15, behavioral = 17. */
export function rubricMaxPoints(rubric: readonly RubricCriterion[]): number {
  return rubric.reduce((a, c) => a + c.max, 0);
}

/**
 * One filled-in interview rubric's score: the plain sum of its criterion points,
 * out of `rubricMaxPoints`.
 *
 * A sum rather than the weighted mean this used to compute. The paper rubrics
 * total to /15 and /17 in the interviewer's hand, and a portal that reported the
 * same interview as a 2.4 gave the panel two different numbers for one
 * conversation. Out-of-range and missing values contribute 0 rather than
 * throwing, so a half-filled draft still totals to something sensible; the API
 * validates properly before anything is stored.
 */
export function rubricTotal(
  rubric: readonly RubricCriterion[],
  scores: Record<string, number>
): number {
  return rubric.reduce((a, c) => {
    const v = Number(scores[c.key]);
    return a + (Number.isFinite(v) && v >= 0 && v <= c.max ? v : 0);
  }, 0);
}

/**
 * One written application's score: the plain sum of its criterion points, out of
 * SCREEN_MAX_POINTS.
 *
 * Out-of-range and missing values contribute 0 rather than throwing, so a
 * half-filled draft still totals to something sensible in the UI. The API
 * validates properly before anything is stored (see isScreenComplete and the
 * reviews route), so a saved row is never a partial one.
 */
export function screenTotal(scores: Partial<Record<RubricKey, number>>): number {
  return RUBRIC.reduce((sum, c) => {
    const v = Number(scores[c.key]);
    return sum + (Number.isFinite(v) ? Math.min(Math.max(v, 0), c.max) : 0);
  }, 0);
}

/**
 * Every criterion carries a score in range.
 *
 * Explicitly a presence check, not a truthiness one: 0 is a legitimate score (an
 * unanswered essay), so `scores[key] > 0` would refuse to let a reviewer submit
 * an honest zero.
 */
export function isScreenComplete(scores: Partial<Record<RubricKey, number>>): boolean {
  return RUBRIC.every((c) => isValidScore(c, scores[c.key]));
}

export type ApplicantAggregate = {
  applicant: Applicant;
  reviewCount: number;
  /** Mean of the reviewers' point totals, out of SCREEN_MAX_POINTS. */
  mean: number | null;
  /** max − min point total across reviewers (the calibration signal). */
  spread: number | null;
  perCriterion: Record<RubricKey, number | null>;
  reviewers: string[];
};

/** True for application-screen reviews. Rows written before the interview console
 *  have no `kind`, so an absent kind counts as a screen. */
export function isScreenReview(r: Review): boolean {
  return !r.kind || r.kind === "screen";
}

/**
 * Aggregate one applicant's WRITTEN-APPLICATION reviews: mean, spread, and
 * per-criterion means, all in points.
 *
 * Interview rubrics from the later rounds score different criteria out of
 * different totals, so they are excluded here — averaging a 12/15 case rubric into
 * a 28-point written total would silently corrupt every number on this screen.
 */
export function aggregate(applicant: Applicant, reviews: Review[]): ApplicantAggregate {
  const rs = reviews.filter((r) => r.applicant_id === applicant.id && isScreenReview(r));
  // Recomputed rather than read from the stored column, so a row written under an
  // older rubric cannot contribute a total that no longer means anything.
  const totals = rs.map((r) => screenTotal(r.scores));
  const mean = totals.length ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100 : null;
  const spread = totals.length ? Math.round((Math.max(...totals) - Math.min(...totals)) * 100) / 100 : null;

  const perCriterion = Object.fromEntries(
    RUBRIC.map((c) => {
      // Presence, not truthiness: a scored 0 belongs in the mean, a missing
      // criterion does not.
      const vals = rs.map((rv) => Number(rv.scores?.[c.key])).filter((v) => Number.isFinite(v));
      const m = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      return [c.key, m];
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

// ── Reviewer assignment ────────────────────────────────────────────────────
export type Assignment = { applicant_id: string; reviewer_email: string };

/**
 * A red (concern) or green (endorsement) flag on a PERSON.
 *
 * The subject is an email, not an application row, because flags are filed at
 * info nights, coffee chats and callouts — often weeks before the application
 * opens. A flag with no `applicant_id` is PENDING: it is waiting for a matching
 * application to arrive, at which point it is claimed and shows up on that
 * applicant's profile with its original author, note, event and timestamp.
 */
export type Flag = {
  id: string;
  created_at: string;
  /** Null while PENDING — nobody has applied from `subject_email` yet. */
  applicant_id: string | null;
  /** Who the flag is about. Always lowercase; the only key a pending flag has. */
  subject_email: string;
  /** Name as the submitter knew it — display only, never used for matching,
   *  since two people share a name far more often than an email. */
  subject_name?: string | null;
  /** Where it was observed: "Fall Info Night", "Coffee chats", "Case night". */
  event?: string | null;
  /** When the flag attached to an applicant. Null while pending. */
  linked_at?: string | null;
  /**
   * Who filed it — present in the database always, but sent to a reader ONLY
   * when the flag is attributed or when it is the reader's own. Absent means
   * anonymous. See `redactFlag`.
   */
  submitter_email?: string | null;
  /**
   * The submitter chose to put their name to this one. Absent or false is
   * anonymous, so a row written before the column existed reads as anonymous —
   * the safe direction for a default to fall in.
   */
  attributed?: boolean;
  color: "red" | "green";
  description: string;
};

/**
 * A flag as a reader may see it.
 *
 * Flags are anonymous unless the person filing one chose otherwise, and the name
 * is stripped HERE — on the server, before the row is serialised — rather than
 * hidden in the component that renders it. A name withheld in the UI but present
 * in the JSON is not withheld; it is one devtools panel away, and the people most
 * motivated to look are exactly the ones the anonymity protects against.
 *
 * The reader always keeps their OWN name, so the intake can still say which
 * pending flags are yours. That leaks nothing: you already know what you filed.
 *
 * The database keeps `submitter_email` on every row regardless. Anonymous here
 * means "not shown to members", not "unrecorded" — an exec chasing an abusive
 * flag can still find it in Supabase, which is the one place that ought to
 * require deliberately going and looking.
 */
export function redactFlag(flag: Flag, viewer: string | null | undefined): Flag {
  const submitter = normalizeSubject(flag.submitter_email ?? "");
  const mine = Boolean(submitter) && submitter === normalizeSubject(viewer ?? "");
  if (flag.attributed || mine) return flag;
  const { submitter_email: _withheld, ...rest } = flag;
  return rest;
}

/** `redactFlag` over a list. A missing viewer redacts everything, which is the
 *  direction a mistake here should fail in. */
export function redactFlags(flags: Flag[], viewer: string | null | undefined): Flag[] {
  return flags.map((f) => redactFlag(f, viewer));
}

/** The one canonical form of a flag subject. Matching is case-insensitive and
 *  whitespace-insensitive; everything else about an email is left alone. */
export function normalizeSubject(email: string): string {
  return email.trim().toLowerCase();
}

/** True while no application has been matched to this flag yet. */
export function isPendingFlag(f: Flag): boolean {
  return !f.applicant_id;
}

/** Split a mixed set into the flags already on a profile and those still waiting. */
export function partitionFlags(flags: Flag[]): { linked: Flag[]; pending: Flag[] } {
  const linked: Flag[] = [];
  const pending: Flag[] = [];
  for (const f of flags) (isPendingFlag(f) ? pending : linked).push(f);
  return { linked, pending };
}

/**
 * The flags a newly-arrived applicant should inherit: every PENDING flag whose
 * subject matches their email.
 *
 * Pure and exported so the claim rule is testable without a database, and so the
 * intake UI can preview "3 flags will attach when they apply" using the same
 * comparison the server will actually run.
 */
export function pendingFlagsFor(flags: Flag[], email: string): Flag[] {
  const key = normalizeSubject(email);
  if (!key) return [];
  return flags.filter((f) => isPendingFlag(f) && normalizeSubject(f.subject_email) === key);
}

/** Flags already attached to one applicant. */
export function flagsForApplicant(flags: Flag[], applicantId: string): Flag[] {
  return flags.filter((f) => f.applicant_id === applicantId);
}

/**
 * True when this flag was filed BEFORE the person applied — it waited in the
 * pending pool and was claimed later.
 *
 * Told apart by the gap between writing and linking: a flag filed on an existing
 * candidate links in the same operation, so the two timestamps are the same
 * moment, while a claimed one links whenever the application happened to arrive.
 * A minute of slack absorbs clock skew between the insert and the claim.
 *
 * Worth showing, because it changes how the note should be read: it was written
 * by someone who met this person at an event, with no application in front of
 * them and no idea they would ever be a candidate.
 */
export function wasFiledBeforeApplying(f: Flag): boolean {
  if (!f.applicant_id || !f.linked_at) return false;
  return new Date(f.linked_at).getTime() - new Date(f.created_at).getTime() > 60_000;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Randomly + evenly assign each applicant to `k` reviewers. Pure and re-runnable:
 *   - respects `existing` assignments (only tops each applicant up to k)
 *   - never assigns a reviewer to themselves (email match) or twice to one applicant
 *   - balances load: picks the least-loaded eligible reviewers, random tie-break
 * Returns ONLY the NEW assignments to insert. `rng` is injectable for deterministic tests.
 *
 * This is the fairness core: reviewers don't choose who they review, assignment is
 * random, and every applicant gets the same number of independent reviewers.
 */
export function planAssignments(
  applicants: { id: string; email: string }[],
  reviewerEmails: string[],
  existing: Assignment[],
  k = 2,
  rng: () => number = Math.random
): Assignment[] {
  const reviewers = [...new Set(reviewerEmails.map((e) => e.toLowerCase()).filter(Boolean))];
  const load = new Map<string, number>(reviewers.map((r) => [r, 0]));
  const assignedTo = new Map<string, Set<string>>();
  for (const a of existing) {
    const r = a.reviewer_email.toLowerCase();
    if (load.has(r)) load.set(r, (load.get(r) ?? 0) + 1);
    if (!assignedTo.has(a.applicant_id)) assignedTo.set(a.applicant_id, new Set());
    assignedTo.get(a.applicant_id)!.add(r);
  }

  const out: Assignment[] = [];
  for (const applicant of shuffle(applicants, rng)) {
    const already = assignedTo.get(applicant.id) ?? new Set<string>();
    const need = Math.max(0, k - already.size);
    if (need === 0) continue;
    const email = (applicant.email ?? "").toLowerCase();
    const eligible = reviewers.filter((r) => !already.has(r) && r !== email);
    // least-loaded first, random tie-break (shuffle then stable sort by load)
    const picked = shuffle(eligible, rng)
      .sort((x, y) => (load.get(x) ?? 0) - (load.get(y) ?? 0))
      .slice(0, need);
    for (const r of picked) {
      out.push({ applicant_id: applicant.id, reviewer_email: r });
      load.set(r, (load.get(r) ?? 0) + 1);
      already.add(r);
    }
    assignedTo.set(applicant.id, already);
  }
  return out;
}
