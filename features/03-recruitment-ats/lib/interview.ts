// The two interview rubrics + pure helpers. No server imports — safe in client
// components.
//
// These are TEMPLATES: fixed criteria with written anchors, identical for every
// candidate. An interviewer never edits the template — they fill in one instance
// of it for the candidate they're assigned, and that instance is their own row in
// `reviews` (unique on applicant + reviewer + kind).

import { ALL_MEMBER_ROLES, canInterviewRole } from "./access";
import type { InterviewRound } from "./rounds";
import { rubricMaxPoints, type Flag, type RubricCriterion, type Stage } from "./types";

/**
 * Roles allowed to interview.
 *
 * Re-exported from ./access rather than listed again here. This module used to
 * keep its own copy, and when interview scoring was opened to every member the
 * copy did not move: `canInterviewRole` said yes, this said no, and since this
 * was the check the routes ran FIRST, the widening had no effect at all. That is
 * the exact failure ./access.ts was written to end — one list, one predicate,
 * every gate reading the same one.
 */
export const INTERVIEWER_ROLES = ALL_MEMBER_ROLES;

export function canInterview(role?: string | null): boolean {
  return canInterviewRole(role);
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
// Transcribed from "FA26 Case Rubric" — the sheet interviewers hold in the room.
// Five categories, each 0–3, totalling 15. The wording of every level is the
// club's, kept verbatim rather than tidied: an anchor only does its job if the
// printed sheet and the portal say exactly the same thing, and an interviewer who
// spots a difference between the two has to stop and work out which one governs.
export const CASE_RUBRIC: readonly RubricCriterion[] = [
  {
    key: "demeanor",
    label: "Demeanor",
    max: 3,
    anchor: "Relaxed, attentive and personable — listens, takes notes, composes their thoughts.",
    levels: [
      {
        min: 3, max: 3, label: "Exceeds Expectations",
        descriptor:
          "You appear relaxed and personable: (you listen, take notes, compose your thoughts, " +
          "and naturally convey your ideas)",
      },
      {
        min: 2, max: 2, label: "Meets Expectations",
        descriptor:
          "You appear attentive and personable, and show deficit in one area but succeed in the " +
          "rest (Is nervous, rush to speak, or struggle to outline ideas).",
      },
      {
        min: 1, max: 1, label: "Below Average",
        descriptor:
          "You appear attentive and personable, but you show deficits in some of the following: " +
          "(you are nervous, rush to speak, or struggle to outline ideas)",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "You appear flustered or unprepared: (you demonstrate a lack of listening skills, " +
          "struggle to organize and communicate thoughts, feeling of awkwardness)",
      },
    ],
  },
  {
    key: "problem_solving",
    label: "Problem Solving",
    max: 3,
    anchor: "Formulates the problem out loud, prioritises the real issues, breaks it into logical parts.",
    levels: [
      {
        min: 3, max: 3, label: "Exceeds Expectations",
        descriptor:
          "You formulate the problem out loud for the interviewer: (you describe and prioritize " +
          "the relevant issues, break the problem down into logical components, and consider the " +
          "implications of the case problem)",
      },
      {
        min: 2, max: 2, label: "Meets Expectations",
        descriptor:
          "You formulate the problem out loud for the interviewer but seem to have some issues " +
          "within your understanding.",
      },
      {
        min: 1, max: 1, label: "Below Average",
        descriptor:
          "You formulate the problem but don't say it outloud to the interviewer. Seems to have " +
          "some understanding of the issue.",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "You fail to formulate the problem (you demonstrate a lack of understanding of the " +
          "problem resulting in faulty assumptions and irrelevant points)",
      },
    ],
  },
  {
    key: "logic_and_communication",
    label: "Logic and Communication",
    max: 3,
    anchor: "Communicates a logical process: clarifying questions, missing information, stated assumptions.",
    levels: [
      {
        min: 3, max: 3, label: "Exceeds Expectations",
        descriptor:
          "You communicate a logical process for tackling the case problem: (you ask clarifying " +
          "questions, describe missing information, and articulate assumptions, and suggest " +
          "possible ways to collect missing data)",
      },
      {
        min: 2, max: 2, label: "Meets Expectations",
        descriptor:
          "You communicate a logical process for tackling the case problem but need to be more " +
          "clear or concise in your approach. (see the first column)",
      },
      {
        min: 1, max: 1, label: "Below Average",
        descriptor:
          "You communicate a logical process for tackling the case problem but need to be more " +
          "clear or concise in your approach. (see the first column)",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "You don't communicate a logical process: (you dont communicate your ideas clearly and " +
          "concisely, your line of reasoning is not able to be followed)",
      },
    ],
  },
  {
    key: "math_question",
    label: "Math Question",
    max: 3,
    anchor: "Performs the appropriate calculations on the relevant information, with little guidance.",
    levels: [
      {
        min: 3, max: 3, label: "Exceeds Expectations",
        descriptor:
          "You answer the questions correctly with little guidance: (you perform the appropriate " +
          "calculations with relevant information)",
      },
      {
        min: 2, max: 2, label: "Meets Expectations",
        descriptor:
          "You arrive at a solution but need guidance or have some miscalculations. " +
          "(see the first column)",
      },
      {
        min: 1, max: 1, label: "Below Average",
        descriptor:
          "You arrive at a solution but need guidance or have some miscalculations. Seems to " +
          "struggle a lot. (see the first column)",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "You don't come close to the solution: (you seem confused, don't perform the " +
          "appropriate calculations, solution is not relevant)",
      },
    ],
  },
  {
    key: "final_case_analysis",
    label: "Final Case Analysis",
    max: 3,
    anchor: "Closes with a logical, organised analysis that considers multiple perspectives, confidently but without arrogance.",
    levels: [
      {
        min: 3, max: 3, label: "Exceeds Expectations",
        descriptor:
          "You provide a strong analysis: (you approach the problem with logic and organization, " +
          "consider multiple perspectives, and you support your points with confidence and " +
          "without arrogance)",
      },
      {
        min: 2, max: 2, label: "Meets Expectations",
        descriptor: "You provide a solid analysis but lack some essential points: (see first column)",
      },
      {
        min: 1, max: 1, label: "Below Average",
        descriptor: "You provide a analysis but lack most essential points: (see first column)",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "You provide a weak analysis: (you do not know how to explain your thinking in a " +
          "logical and clear way, do not consider multiple perspectives and lack conviction or " +
          "confidence)",
      },
    ],
  },
] as const;

// ── Behavioral rubric ────────────────────────────────────────────────────────
// Transcribed from "FA26 Behavioral Rubric". Six categories totalling 17, and
// unlike the case rubric the categories are NOT worth the same: most cap at 2,
// but Goals caps at 4 and Competence at 5 — the sheet marks both "points are
// increased per box" and prints score ranges in place of single numbers. That is
// the club deciding a candidate's trajectory and their resume carry more weight
// than how they dressed, so the ceilings are part of the rubric's meaning and are
// modelled directly rather than flattened into a uniform scale.
//
// Each category is judged against two sub-questions (`prompts`) and the awarded
// score is the average of the two, as the sheet's score column says.
export const BEHAVIORAL_RUBRIC: readonly RubricCriterion[] = [
  {
    key: "understanding",
    label: "Understanding",
    max: 2,
    prompts: [
      "Do they understand CUBE consulting and our core values?",
      "Do they explain how they could benefit CUBE and how CUBE would benefit them?",
    ],
    anchor: "Understands the CUBE mission and consulting, and says why they fit with real reasons.",
    levels: [
      {
        min: 2, max: 2, label: "Exceeds Expectations",
        descriptor:
          "Deep understanding of CUBE mission. Explains why they would be a good fit for CUBE " +
          "based on relevant experiences and personal qualities/values",
      },
      {
        min: 1, max: 1, label: "Meets Expectations",
        descriptor:
          "General understanding of CUBE mission and field of consulting. Explains why they " +
          "would be a good fit for CUBE.",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "No or wrong understanding of CUBE mission and field of consulting. Doesn't mention " +
          "why they are a good fit for CUBE.",
      },
    ],
  },
  {
    key: "goals",
    label: "Goals",
    max: 4,
    prompts: [
      "Do they have a clear commitment towards growth in our organization?",
      "Do they express desire to go above what is asked of them?",
    ],
    anchor: "Wants to grow into CUBE over years, not semesters, and to improve the club as well as themselves.",
    levels: [
      {
        min: 3, max: 4, label: "Exceeds Expectations",
        descriptor:
          "Clearly wants to grow into leadership positions and/or shows strong commitment beyond " +
          "internships. Would stay in CUBE for 1+ years. Desire to improve themselves and CUBE " +
          "in specific ways",
      },
      {
        min: 1, max: 2, label: "Meets Expectations",
        descriptor:
          "Wants to remain in CUBE but is not fully confident in their path. Would likely stay " +
          "in CUBE for a few semesters. Desire to improve themselves professionally/ in consulting",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "No good plan or their answers seem fake/ not aligned with their other answers. Seems " +
          "only interested in CUBE for building resume. Would likely leave CUBE after one semester",
      },
    ],
  },
  {
    key: "adaptability",
    label: "Adaptability",
    max: 2,
    prompts: [
      "Do they understand how to work in a team / how to lead?",
      "Do they provide examples showing flexibility within a team? What did they do to better the team?",
    ],
    anchor: "Understands flexibility and leadership, with examples naming their own contribution.",
    levels: [
      {
        min: 2, max: 2, label: "Exceeds Expectations",
        descriptor:
          "Gives in depth understanding of both flexibility and their own leadership. Gives " +
          "examples that highlight both the role of good teamwork and their specific " +
          "contributions/lessons learned",
      },
      {
        min: 1, max: 1, label: "Meets Expectations",
        descriptor:
          "Gives clear understanding of a productive team structure. Gives examples that " +
          "highlight good teamwork practices and their contributions",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "Doesn't understand how teams work productively. Examples given do not demonstrate " +
          "good leadership/teamwork",
      },
    ],
  },
  {
    key: "time_management",
    label: "Time Management",
    max: 2,
    prompts: [
      "How well do they manage time and set reasonable deadlines?",
      "Do they provide specific examples of effective time management?",
    ],
    anchor: "Time management that fits CUBE's standards, with CUBE realistically in the schedule.",
    levels: [
      {
        min: 2, max: 2, label: "Exceeds Expectations",
        descriptor:
          "Gives a balanced understanding of time management that fits CUBE's standards. CUBE " +
          "fits into schedule reasonably. Gives detailed, realistic and effective examples of " +
          "time management and prioritization",
      },
      {
        min: 1, max: 1, label: "Meets Expectations",
        descriptor:
          "Gives a good sign of knowing how to manage time but might need guidance in the " +
          "future. CUBE would not be a priority in applicant's schedule. Gives good but vague " +
          "examples of time management and prioritization",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "Gives a concerning display of what time management should look like. Gives inadequate " +
          "examples of time management. Likely would not have time for CUBE",
      },
    ],
  },
  {
    key: "presentation",
    label: "Presentation",
    max: 2,
    prompts: [
      "Are they able to remain confident under pressure?",
      "Are they likeable in a professional setting?",
    ],
    anchor: "Confident body language and professional dress; someone you enjoyed talking to.",
    levels: [
      {
        min: 2, max: 2, label: "Exceeds Expectations",
        descriptor:
          "Open and confident body language (good eye contact, strong posture, etc). " +
          "Professional dress. Was a pleasure to get to know and easy to talk to",
      },
      {
        min: 1, max: 1, label: "Meets Expectations",
        descriptor:
          "Reasonable body language, maybe a bit nervous. Somewhat appropriate dress. Was a nice " +
          "person to talk to",
      },
      {
        min: 0, max: 0, label: "Unacceptable Answer",
        descriptor:
          "Extremely annoying or otherwise inappropriate body language. Inappropriate dress. " +
          "Clearly rude",
      },
    ],
  },
  {
    key: "competence",
    label: "Competence",
    max: 5,
    prompts: [
      "Can they clearly organize and present their thoughts?",
      "Can they think on the spot and adapt to challenging questions?",
    ],
    anchor:
      "Scored on the resume-review questions: articulate and organised, with experience that " +
      "sounds real and would carry over into CUBE.",
    levels: [
      {
        min: 4, max: 5, label: "Exceeds Expectations",
        descriptor:
          "Exceptionally articulate, clear, organized speech. You are confident their experiences " +
          "are real and would carry over into CUBE",
      },
      {
        min: 2, max: 3, label: "Meets Expectations",
        descriptor:
          "Articulate, clear, throughout interview. Adequately answers questions and experience " +
          "sounds real",
      },
      {
        min: 0, max: 1, label: "Unacceptable Answer",
        descriptor:
          "Not articulate, clear, or organized. Trouble answering questions or not confident in " +
          "their experiences",
      },
    ],
  },
] as const;

/**
 * The behavioral interview script, in the order it is asked.
 *
 * Carried here beside the rubric because the two only make sense together: each
 * question names the category it feeds, and an interviewer scoring "Goals"
 * without having asked question 4 is scoring a conversation that never happened.
 * `category` is a rubric key, or null for the questions the sheet marks as
 * unscored.
 */
export type BehavioralQuestion = {
  n: number;
  text: string;
  category: string | null;
  /** Interviewer prepares this one from the resume before the interview starts. */
  resumeReview?: boolean;
};

export const BEHAVIORAL_QUESTIONS: readonly BehavioralQuestion[] = [
  {
    n: 1,
    text: "Tell me about yourself and why you applied to CUBE. (Also ask any questions you may have about their resume)",
    category: "understanding",
  },
  {
    n: 2,
    text: "Ask a question about a point on their resume that would demonstrate Business or Engineering ability.",
    category: "competence",
    resumeReview: true,
  },
  {
    n: 3,
    text: "Ask a question about a point on their resume that would demonstrate their Leadership qualities and abilities. Try to evaluate if they are committed in that activity or organization (can ask followup questions).",
    category: "competence",
    resumeReview: true,
  },
  {
    n: 4,
    text: "How do you envision your progression in our organization, how long are you planning to stay active, what positions would you like to have?",
    category: "goals",
  },
  {
    n: 5,
    text: "Tell us about when you encountered a sudden change working on a project or team. How did that impact you and how did you adapt to the situation?",
    category: "adaptability",
  },
  {
    n: 6,
    text: "What is your schedule looking like this semester and how do you plan to manage time? Provide us with an example of how you have handled time management.",
    category: "time_management",
  },
  {
    n: 7,
    text: "Teach me a concept from one of your classes in 1 minute or less / FUN QUESTIONS",
    category: "presentation",
  },
  {
    n: 8,
    text: "Do you have a specific leaning towards business projects or more technical projects? This is for internal use only, and you will not be scored on your answer.",
    category: null,
  },
  { n: 9, text: "Do you have any questions for us?", category: null },
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
  /** Just `{ total }` — see SCORE_KEY. */
  scores: Record<string, number>;
  notes: string;
  recommendation: Recommendation | null;
  weighted_total: number;
  updated_at?: string;
};

// ── What an interviewer submits ──────────────────────────────────────────────
// One number: the total off the paper sheet.
//
// The scoring itself happens on the rubric in the candidate's Drive folder — that
// PDF is the club's document, it is what interviewers mark up in the room, and it
// is where the per-category judgements live. The portal deliberately does not ask
// for those categories a second time. Re-keying five or six numbers that already
// exist on paper is transcription work that earns nothing, and it invites the
// worse failure: a portal total that disagrees with the sheet it was copied from.
//
// So the rubric is REFLECTED here — every category, ceiling and level description
// is in CASE_RUBRIC / BEHAVIORAL_RUBRIC above and rendered next to the input, so
// an interviewer can see exactly what they are scoring out of and what each band
// means — but the thing that is STORED is the one number they wrote at the bottom.

/** The single key `reviews.scores` carries for an interview rubric. */
export const SCORE_KEY = "total";

/** The highest score this rubric can award: case 15, behavioral 17. */
export function rubricMax(kind: InterviewKind): number {
  return rubricMaxPoints(INTERVIEW_RUBRICS[kind]);
}

/** The submitted total, or null when this rubric has not been scored yet. */
export function submittedTotal(
  kind: InterviewKind,
  scores: Record<string, number> | null | undefined
): number | null {
  const v = scores?.[SCORE_KEY];
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v >= 0 && v <= rubricMax(kind) ? v : null;
}

/**
 * A rubric counts as complete once it carries a whole-number total within
 * 0..max.
 *
 * Not coerced, and deliberately so. `Number(null)` and `Number("")` are both 0,
 * and 0 is a real total on these sheets — every category "Unacceptable Answer" —
 * rather than "not yet scored". Coercing would let an untouched form submit as a
 * scored zero, which is the harshest possible review and indistinguishable from a
 * blank one.
 */
export function isComplete(kind: InterviewKind, scores: Record<string, number>): boolean {
  return submittedTotal(kind, scores) !== null;
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
  /** Every panelist's submitted total. Present only for exec; undefined otherwise,
   *  so a panelist's client never receives another panelist's number at all. */
  panelScores?: PanelScore[];
  /**
   * Red/green flags filed on this person, so the board can show them beside the
   * name like the written console and the decision queue do.
   *
   * Flags are club-wide by design: any member may file one, and every member who
   * can see a candidate can see what was said about them. Carrying them here is
   * what makes that true on the LAST screen where it matters — an interviewer
   * walking into the room should not be the only person who never saw that two
   * people raised a concern.
   */
  flags: Flag[];
};

/**
 * One panelist's submitted total for one rubric. Only ever sent to a viewer who
 * may manage the round — see the gate in interview-store.ts.
 */
export type PanelScore = {
  reviewer: string;
  kind: InterviewKind;
  total: number;
  recommendation: string | null;
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
