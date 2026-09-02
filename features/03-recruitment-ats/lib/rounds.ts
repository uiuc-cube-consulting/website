// The three rounds a candidate moves through, and the rule for who may see each.
// Pure — no server imports, safe in client components so the UI can hide exactly
// what the API would refuse.
//
// Recruiting used to be one undifferentiated pool of applicants with a `stage`
// column and two consoles that both showed everybody. That made three separate
// things look like one:
//
//   WRITTEN       Everything that arrives from the Google Form: the essay answers
//                 and the resume. Scored on the point rubric in ./types.ts by two
//                 randomly assigned readers. Every applicant is here.
//
//   FIRST ROUND   The people the written round advanced. Case and behavioral
//                 interviews, scored on the points rubrics in ./interview.ts —
//                 the case out of 15, the behavioral out of 17 — and the point at
//                 which each candidate gets a provisioned Drive folder holding
//                 their resume and both rubric docs. Provisioning is deliberately
//                 not done for the whole applicant pool — a folder per written
//                 applicant is hundreds of folders nobody opens.
//
//   FINAL ROUND   EXEC ONLY, in every direction: who appears on the board, whose
//                 scores can be read, and who may write a rubric. A final-round
//                 score is the last thing said about a candidate before an offer,
//                 and it is said in front of the smallest possible room.
//
// A round is derived from the applicant's stage rather than stored beside it, so
// the two can never disagree. Moving a candidate between rounds is exactly one
// write — the stage change exec already makes — and nothing else has to be kept
// in sync.

import { canInterviewRole, isExec } from "./access";
import type { Stage } from "./types";

export const ROUNDS = ["written", "first_round", "final_round"] as const;
export type Round = (typeof ROUNDS)[number];

/** The two rounds conducted as live interviews, as opposed to reading an application. */
export const INTERVIEW_ROUNDS = ["first_round", "final_round"] as const;
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];

export function isRound(v: unknown): v is Round {
  return typeof v === "string" && (ROUNDS as readonly string[]).includes(v);
}

export function isInterviewRound(v: unknown): v is InterviewRound {
  return v === "first_round" || v === "final_round";
}

export const ROUND_LABEL: Record<Round, string> = {
  written: "Written applications",
  first_round: "First round",
  final_round: "Final round",
};

export const ROUND_BLURB: Record<Round, string> = {
  written: "Essays and resume, scored out of 28 points by two independent readers.",
  first_round: "Case (out of 15) and behavioral (out of 17) interviews, with a Drive folder per candidate.",
  final_round: "Exec-only final interviews. Nobody outside exec sees this round.",
};

/**
 * Which applicant stages belong to which round.
 *
 * `applied` and `screened` are both the written round: "screened" means a decision
 * has been recorded, not that the candidate has moved on. `offer` and `accepted`
 * are past the last round entirely and belong to none of them, as are the terminal
 * `rejected` / `withdrawn`.
 */
export const ROUND_STAGES: Record<Round, readonly Stage[]> = {
  written: ["applied", "screened"],
  first_round: ["interview"],
  final_round: ["final_round"],
};

/** The round a candidate is currently being worked in, or null if they are past
 *  the rounds (offer/accepted) or out of the process (rejected/withdrawn). */
export function roundOfStage(stage: Stage): Round | null {
  for (const round of ROUNDS) {
    if (ROUND_STAGES[round].includes(stage)) return round;
  }
  return null;
}

/** True when this candidate is live in `round` right now. */
export function isInRound(stage: Stage, round: Round): boolean {
  return ROUND_STAGES[round].includes(stage);
}

/** The stage a candidate lands on when advanced INTO `round`. */
export function entryStage(round: Round): Stage {
  return ROUND_STAGES[round][0];
}

/**
 * Whether a role may see this round at all — its candidates, its scores, its
 * panels.
 *
 * The only restricted round is the final one, and it is restricted to exec. This
 * is the predicate the UI hides behind AND the one every final-round route
 * re-checks; there is no second copy of the rule to fall out of step.
 */
export function canViewRound(round: Round, role?: string | null): boolean {
  return round === "final_round" ? isExec(role) : true;
}

/** Rounds this role may open, in order. */
export function visibleRounds(role?: string | null): Round[] {
  return ROUNDS.filter((r) => canViewRound(r, role));
}

/**
 * Whether a role may sit a panel and write rubrics in `round`.
 *
 * Strictly narrower than `canViewRound`: the first round is staffed from the
 * whole recruiting pool (PMs, SCs, returning members and exec), the final round
 * is exec and nobody else. Panel membership still gates the individual candidate
 * on top of this — this is the floor, not the whole rule.
 */
export function canInterviewInRound(round: InterviewRound, role?: string | null): boolean {
  return round === "final_round" ? isExec(role) : canInterviewRole(role);
}
