// The two interview rubrics + pure helpers. No server imports — safe in client
// components.
//
// These are TEMPLATES: fixed criteria with written anchors, identical for every
// candidate. An interviewer never edits the template — they fill in one instance
// of it for the candidate they're assigned, and that instance is their own row in
// `reviews` (unique on applicant + reviewer + kind).

import type { InterviewRound } from "./rounds";
import type { RubricCriterion, Stage } from "./types";

/** Roles allowed to interview. Mirrors the reviewer roles in proxy.ts / store.ts. */
export const INTERVIEWER_ROLES = ["exec", "project_manager", "senior_consultant", "returning_member"];

export function canInterview(role?: string | null): boolean {
  return Boolean(role && INTERVIEWER_ROLES.includes(role));
}

// ── Kinds ────────────────────────────────────────────────────────────────────
// A review's `kind` is what says which ROUND it belongs to. The first and final
// rounds run the same two conversations, but they are stored under separate kinds
// rather than sharing `case`/`behavioral`, for two reasons:
//
//   1. The uniqueness key on `reviews` is (applicant, reviewer, kind). An exec who
//      interviews a candidate in the first round and again in the final would
//      otherwise overwrite their own first-round rubric on save — silently losing
//      the earlier score at exactly the moment both are worth comparing.
//   2. Final-round scores are exec-only. Keeping them under their own kinds means
//      the restriction is a filter on a column, not a join through the applicant's
//      current stage, so a candidate moving stages can never expose them.

export type ReviewKind = "screen" | InterviewKind;

export const INTERVIEW_KINDS = ["case", "behavioral", "final_case", "final_behavioral"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

/** The two rubrics conducted in each round, in the order the console shows them. */
export const ROUND_KINDS: Record<InterviewRound, readonly InterviewKind[]> = {
  first_round: ["case", "behavioral"],
  final_round: ["final_case", "final_behavioral"],
};

export function isInterviewKind(v: unknown): v is InterviewKind {
  return typeof v === "string" && (INTERVIEW_KINDS as readonly string[]).includes(v);
}

/** Which round a rubric belongs to — the inverse of ROUND_KINDS. */
export function roundOfKind(kind: InterviewKind): InterviewRound {
  return kind.startsWith("final_") ? "final_round" : "first_round";
}

/** True when `kind` is one of the rubrics `round` actually runs. */
export function isKindInRound(kind: InterviewKind, round: InterviewRound): boolean {
  return ROUND_KINDS[round].includes(kind);
}

// ── Case rubric ──────────────────────────────────────────────────────────────
export const CASE_RUBRIC: readonly RubricCriterion[] = [
  {
    key: "structure",
    label: "Structure",
    weight: 1,
    anchor: "Builds a tailored, non-overlapping framework and states it before diving in. 5 = the structure itself cracks the case; 3 = a sound but generic framework; 1 = unstructured, jumps to tactics.",
  },
  {
    key: "quantitative",
    label: "Quantitative",
    weight: 1,
    anchor: "Sets up the math cleanly, computes accurately, sanity-checks the result. 5 = fast and error-free with an instinct for magnitude; 3 = correct with prompting; 1 = setup or arithmetic breaks down.",
  },
  {
    key: "business_judgment",
    label: "Business judgment",
    weight: 1,
    anchor: "Separates what drives the answer from what doesn't; recommendations are practical. 5 = surfaces the insight unprompted; 3 = reasonable once pointed at it; 1 = misreads what matters.",
  },
  {
    key: "synthesis",
    label: "Synthesis",
    weight: 1,
    anchor: "Closes top-down: recommendation first, then reasons, then risks. 5 = crisp and client-ready; 3 = complete but rambling; 1 = no clear answer given.",
  },
] as const;

// ── Behavioral rubric ────────────────────────────────────────────────────────
export const BEHAVIORAL_RUBRIC: readonly RubricCriterion[] = [
  {
    key: "motivation",
    label: "Motivation & fit",
    weight: 1,
    anchor: "Specific, credible reasons for consulting and for CUBE. 5 = has clearly done the work to understand us; 3 = genuine but generic; 1 = could be reciting this for any club.",
  },
  {
    key: "leadership",
    label: "Leadership & ownership",
    weight: 1,
    anchor: "Takes responsibility for outcomes, moves a group, handles conflict directly. 5 = concrete example where they owned the result; 3 = participated meaningfully; 1 = describes what the team did, not what they did.",
  },
  {
    key: "communication",
    label: "Communication",
    weight: 1,
    anchor: "Concise, structured, and actually answers the question asked. 5 = you could put them in front of a client this semester; 3 = clear with some meandering; 1 = hard to follow.",
  },
  {
    key: "teamwork",
    label: "Teamwork & coachability",
    weight: 1,
    anchor: "Collaborative, takes feedback, gives credit. 5 = would visibly raise the people around them; 3 = pleasant and easy to work with; 1 = defensive or dismissive of others.",
  },
] as const;

// Both rounds score the same two rubrics. The criteria that make a good case
// interview do not change between a first and a final round — what changes is who
// is in the room and how much the answer counts — so the templates are shared
// deliberately rather than duplicated into a near-identical third and fourth copy.
export const INTERVIEW_RUBRICS: Record<InterviewKind, readonly RubricCriterion[]> = {
  case: CASE_RUBRIC,
  behavioral: BEHAVIORAL_RUBRIC,
  final_case: CASE_RUBRIC,
  final_behavioral: BEHAVIORAL_RUBRIC,
};

export const KIND_LABEL: Record<InterviewKind, string> = {
  case: "Case",
  behavioral: "Behavioral",
  final_case: "Case",
  final_behavioral: "Behavioral",
};

// ── Bottom-line recommendation ───────────────────────────────────────────────
export const RECOMMENDATIONS = [
  { key: "strong_yes", label: "Strong yes" },
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
  { key: "strong_no", label: "Strong no" },
] as const;

export type Recommendation = (typeof RECOMMENDATIONS)[number]["key"];

export function isRecommendation(v: unknown): v is Recommendation {
  return RECOMMENDATIONS.some((r) => r.key === v);
}

// ── The filled-in rubric an interviewer owns ─────────────────────────────────
export type RubricEntry = {
  kind: InterviewKind;
  scores: Record<string, number>;
  notes: string;
  recommendation: Recommendation | null;
  weighted_total: number;
  updated_at?: string;
};

/** A rubric counts as complete only when every criterion has a 1–5 score. */
export function isComplete(kind: InterviewKind, scores: Record<string, number>): boolean {
  return INTERVIEW_RUBRICS[kind].every((c) => {
    const v = Number(scores[c.key]);
    return Number.isFinite(v) && v >= 1 && v <= 5;
  });
}

// ── Wire format ──────────────────────────────────────────────────────────────
// The exact shape GET /api/recruitment/interview returns. Declared here (the pure
// module) so the server layer and the client components can't drift apart.
//
// Note what is absent: the Drive file id, and any other interviewer's scores or
// notes. The client addresses a resume by APPLICANT id, and only ever sees its own
// rubrics — the same blind-ish rule the application-screen feed follows.

export type ResumeInfo = {
  name: string | null;
  mime: string | null;
  /** email | name | token | fuzzy | manual — "fuzzy" is worth spot-checking. */
  match: string | null;
  linkedAt: string | null;
};

export type Candidate = {
  id: string;
  name: string;
  email: string;
  year?: string;
  major?: string;
  college?: string;
  stage: Stage;
  resume: ResumeInfo | null;
  /** Provisioned Drive folder (resume + rubric docs + notes), when one exists.
   *  A URL only — the folder id stays server-side, same posture as `resume`. */
  driveFolderUrl?: string | null;
  /** Interviewers on THIS ROUND's panel for this candidate (lowercased emails).
   *  A first-round panel and a final-round panel are separate rows. */
  panel: string[];
  assignedToMe: boolean;
  /** Only the active round's kinds are ever populated; the others stay null. */
  myRubrics: Record<InterviewKind, RubricEntry | null>;
  /** How many panelists have completed each rubric — a count only, no scores. */
  completed: Record<InterviewKind, number>;
};

export type Reviewer = { email: string; name?: string | null };

export type InterviewBoard = {
  /** Which round this board is: its candidates, panels and rubrics are all scoped
   *  to it, and a final-round board is only ever served to exec. */
  round: InterviewRound;
  /** Rounds the viewer may switch to — everyone gets the first, exec also the final. */
  availableRounds: InterviewRound[];
  candidates: Candidate[];
  pool: Reviewer[];
  demo: boolean;
  viewer: string;
  canManage: boolean;
};
