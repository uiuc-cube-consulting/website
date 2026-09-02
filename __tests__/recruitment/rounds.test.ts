/**
 * The three-round model, and the point rubric that scores the first of them.
 *
 * Recruiting used to be one pool of applicants with a `stage` column and two
 * consoles that both showed everybody. These tests pin the separation that
 * replaced it — which stages belong to which round, which rubric each round
 * writes, and who is allowed to see the last one — because every part of it is a
 * rule the UI hides behind AND the API re-checks, and the two only stay honest if
 * they read from the same place.
 */

import {
  INTERVIEW_ROUNDS,
  ROUNDS,
  ROUND_STAGES,
  canInterviewInRound,
  canViewRound,
  entryStage,
  isInRound,
  isInterviewRound,
  isRound,
  roundOfStage,
  visibleRounds,
  type Round,
} from "@/features/03-recruitment-ats/lib/rounds";
import {
  INTERVIEW_KINDS,
  INTERVIEW_RUBRICS,
  ROUND_KINDS,
  isKindInRound,
  roundOfKind,
} from "@/features/03-recruitment-ats/lib/interview";
import {
  RUBRIC,
  SCREEN_MAX_POINTS,
  STAGES,
  isScreenComplete,
  isValidScore,
  screenTotal,
  type RubricKey,
  type Scores,
} from "@/features/03-recruitment-ats/lib/types";

const ROLES = ["exec", "project_manager", "senior_consultant", "returning_member", "member"] as const;

// ── Rounds and stages ────────────────────────────────────────────────────────

describe("ROUND_STAGES", () => {
  it("puts every stage in at most one round", () => {
    const seen = new Map<string, Round>();
    for (const round of ROUNDS) {
      for (const stage of ROUND_STAGES[round]) {
        expect(seen.has(stage)).toBe(false);
        seen.set(stage, round);
      }
    }
  });

  it("only names stages the funnel actually has", () => {
    for (const round of ROUNDS) {
      for (const stage of ROUND_STAGES[round]) {
        expect(STAGES as readonly string[]).toContain(stage);
      }
    }
  });

  it("treats the written round as everything before the first interview", () => {
    expect(ROUND_STAGES.written).toEqual(["applied", "screened"]);
    expect(ROUND_STAGES.first_round).toEqual(["interview"]);
    expect(ROUND_STAGES.final_round).toEqual(["final_round"]);
  });
});

describe("roundOfStage", () => {
  it.each([
    ["applied", "written"],
    ["screened", "written"],
    ["interview", "first_round"],
    ["final_round", "final_round"],
  ] as const)("%s is the %s round", (stage, round) => {
    expect(roundOfStage(stage)).toBe(round);
  });

  it("returns null once a candidate is past the rounds or out of the process", () => {
    // These are not "some other round" — there is no work left to do on them, and
    // treating them as a round would put them back on somebody's board.
    for (const stage of ["offer", "accepted", "rejected", "withdrawn"] as const) {
      expect(roundOfStage(stage)).toBeNull();
    }
  });

  it("agrees with isInRound", () => {
    for (const stage of [...STAGES, "rejected", "withdrawn"] as const) {
      for (const round of ROUNDS) {
        expect(isInRound(stage, round)).toBe(roundOfStage(stage) === round);
      }
    }
  });
});

describe("entryStage", () => {
  it("lands a candidate on the first stage of the round they are advanced into", () => {
    expect(entryStage("first_round")).toBe("interview");
    expect(entryStage("final_round")).toBe("final_round");
    // Round-trips: advancing into a round puts you in it.
    for (const round of ROUNDS) expect(roundOfStage(entryStage(round))).toBe(round);
  });
});

describe("isRound / isInterviewRound", () => {
  it("accepts the real rounds and nothing else", () => {
    for (const r of ROUNDS) expect(isRound(r)).toBe(true);
    for (const bad of ["semifinal", "", "FIRST_ROUND", null, undefined, 1, {}]) {
      expect(isRound(bad)).toBe(false);
    }
  });

  it("counts only the two interview rounds as interview rounds", () => {
    expect(isInterviewRound("written")).toBe(false);
    for (const r of INTERVIEW_ROUNDS) expect(isInterviewRound(r)).toBe(true);
  });
});

// ── Visibility: the final round is exec-only ─────────────────────────────────

describe("canViewRound", () => {
  it("opens the written and first rounds to every recruiting role", () => {
    for (const role of ROLES) {
      expect(canViewRound("written", role)).toBe(true);
      expect(canViewRound("first_round", role)).toBe(true);
    }
  });

  it("closes the final round to everyone but exec", () => {
    for (const role of ROLES) {
      expect(canViewRound("final_round", role)).toBe(role === "exec");
    }
    expect(canViewRound("final_round", null)).toBe(false);
    expect(canViewRound("final_round", undefined)).toBe(false);
  });
});

describe("visibleRounds", () => {
  it("offers exec all three and everyone else the first two", () => {
    expect(visibleRounds("exec")).toEqual(["written", "first_round", "final_round"]);
    for (const role of ROLES.filter((r) => r !== "exec")) {
      expect(visibleRounds(role)).toEqual(["written", "first_round"]);
    }
  });
});

describe("canInterviewInRound", () => {
  it("opens the first round to every member with portal access", () => {
    // Interviews are staffed from whoever is in the room, so a plain member may
    // record a first-round score. The written screen stays narrower — it is
    // assigned round-robin and its fairness depends on that holding.
    for (const role of ROLES) {
      expect(canInterviewInRound("first_round", role)).toBe(true);
    }
  });

  it("staffs the final round with exec alone", () => {
    for (const role of ROLES) {
      expect(canInterviewInRound("final_round", role)).toBe(role === "exec");
    }
  });

  it("is never wider than what the round lets you see", () => {
    for (const round of INTERVIEW_ROUNDS) {
      for (const role of [...ROLES, null]) {
        if (canInterviewInRound(round, role)) expect(canViewRound(round, role)).toBe(true);
      }
    }
  });
});

// ── Rubric kinds carry the round ─────────────────────────────────────────────

describe("ROUND_KINDS", () => {
  it("gives the two rounds disjoint kinds", () => {
    // This is what stops an exec's final-round rubric from overwriting their own
    // first-round one: the uniqueness key on `reviews` is (applicant, reviewer,
    // kind), so the two rounds must not share a kind.
    const first = new Set<string>(ROUND_KINDS.first_round);
    for (const k of ROUND_KINDS.final_round) expect(first.has(k)).toBe(false);
  });

  it("accounts for every kind exactly once", () => {
    const all = [...ROUND_KINDS.first_round, ...ROUND_KINDS.final_round].sort();
    expect(all).toEqual([...INTERVIEW_KINDS].sort());
  });

  it("round-trips through roundOfKind", () => {
    for (const round of INTERVIEW_ROUNDS) {
      for (const kind of ROUND_KINDS[round]) {
        expect(roundOfKind(kind)).toBe(round);
        expect(isKindInRound(kind, round)).toBe(true);
      }
    }
  });

  it("refuses a kind from the other round", () => {
    expect(isKindInRound("case", "final_round")).toBe(false);
    expect(isKindInRound("final_case", "first_round")).toBe(false);
  });

  it("has a rubric template for every kind", () => {
    for (const kind of INTERVIEW_KINDS) {
      expect(INTERVIEW_RUBRICS[kind]).toBeDefined();
      expect(INTERVIEW_RUBRICS[kind].length).toBeGreaterThan(0);
    }
  });
});

// ── The written-application rubric ───────────────────────────────────────────

describe("the written rubric", () => {
  it("is the six criteria the club scores, with the ceilings it agreed", () => {
    expect(RUBRIC.map((c) => [c.key, c.max])).toEqual([
      ["essay_1", 5],
      ["essay_2", 3],
      ["essay_3", 3],
      ["case_essay", 7],
      ["misc", 5],
      ["resume", 5],
    ]);
  });

  it("totals 28", () => {
    expect(SCREEN_MAX_POINTS).toBe(28);
  });

  it("gives the case essay the most weight of any single item", () => {
    const heaviest = Math.max(...RUBRIC.map((c) => c.max));
    expect(RUBRIC.filter((c) => c.max === heaviest).map((c) => c.key)).toEqual(["case_essay"]);
  });

  it("writes an anchor for every criterion", () => {
    for (const c of RUBRIC) expect(c.anchor.length).toBeGreaterThan(20);
  });
});

const full = (v: number): Scores =>
  Object.fromEntries(RUBRIC.map((c) => [c.key, Math.min(v, c.max)])) as Scores;

describe("isValidScore", () => {
  it("accepts every whole number in the criterion's own range, zero included", () => {
    for (const c of RUBRIC) {
      for (let v = 0; v <= c.max; v++) expect(isValidScore(c, v)).toBe(true);
    }
  });

  it("enforces each criterion's OWN ceiling, not a shared one", () => {
    // A flat 0-7 check would wave through a 7 on a 3-point essay.
    const essay2 = RUBRIC.find((c) => c.key === "essay_2")!;
    const caseEssay = RUBRIC.find((c) => c.key === "case_essay")!;
    expect(isValidScore(essay2, 7)).toBe(false);
    expect(isValidScore(caseEssay, 7)).toBe(true);
  });

  it("rejects negatives, fractions, and anything that isn't a number", () => {
    const c = RUBRIC[0];
    for (const bad of [-1, 2.5, NaN, Infinity, "3", null, undefined, {}]) {
      expect(isValidScore(c, bad)).toBe(false);
    }
  });
});

describe("screenTotal", () => {
  it("is the plain sum of the criterion points", () => {
    expect(screenTotal({ essay_1: 4, essay_2: 3, essay_3: 2, case_essay: 6, misc: 3, resume: 4 })).toBe(22);
  });

  it("is 0 for an application that scored nothing, and 28 for a perfect one", () => {
    expect(screenTotal(full(0))).toBe(0);
    expect(screenTotal(full(99))).toBe(SCREEN_MAX_POINTS);
  });

  it("never lets one criterion contribute more than its ceiling", () => {
    // Defence in depth: the API validates before storing, but a legacy row or a
    // hand-edited one must not be able to inflate a total past the scale.
    expect(screenTotal({ essay_2: 99 } as Partial<Scores>)).toBe(3);
  });

  it("treats a missing criterion as zero rather than throwing", () => {
    expect(screenTotal({} as Partial<Scores>)).toBe(0);
    expect(screenTotal({ case_essay: 7 } as Partial<Scores>)).toBe(7);
  });

  it("scores a review written under the OLD four-criterion rubric as zero", () => {
    // The old keys buy nothing on the new rubric. Scoring them as 0 rather than
    // crashing is what lets a mid-migration table still render (db/rounds.sql
    // documents the optional cleanup).
    const legacy = { problem_solving: 4, communication: 4, drive: 5, fit: 4 } as unknown as Scores;
    expect(screenTotal(legacy)).toBe(0);
  });
});

describe("isScreenComplete", () => {
  it("requires a value for every criterion", () => {
    expect(isScreenComplete(full(3))).toBe(true);
    const { resume: _omitted, ...partial } = full(3);
    expect(isScreenComplete(partial as Partial<Scores>)).toBe(false);
  });

  it("counts a straight-zero rubric as complete", () => {
    // The property the whole 0-based scale rests on: an application that answered
    // nothing is scoreable, and the reviewer must not have to inflate a blank
    // essay to a 1 just to be allowed to submit.
    expect(isScreenComplete(full(0))).toBe(true);
  });

  it("refuses a criterion scored past its ceiling", () => {
    expect(isScreenComplete({ ...full(3), essay_2: 5 })).toBe(false);
  });

  it("agrees with isValidScore on every criterion", () => {
    for (const c of RUBRIC) {
      const scores = { ...full(1), [c.key as RubricKey]: c.max + 1 };
      expect(isScreenComplete(scores)).toBe(false);
    }
  });
});
