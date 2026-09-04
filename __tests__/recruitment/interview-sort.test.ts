/**
 * Ordering the interview board.
 *
 * The written round's decision queue has offered three orders for a while
 * (lib/decision.ts). These pin the same three on the round after it, where the
 * inputs are different — two rubrics scored by a panel rather than two reads of
 * one application — and where the disagreement worth surfacing is a
 * recommendation that crosses the yes/no line rather than a points spread.
 */

import {
  ROUND_KINDS,
  recommendationSide,
  sortBoard,
  splitSeverity,
  type Candidate,
  type InterviewKind,
  type PanelScore,
  type Recommendation,
  type RubricEntry,
} from "@/features/03-recruitment-ats/lib/interview";

const FIRST = ROUND_KINDS.first_round;

function candidate(id: string, name: string, panelScores: PanelScore[] = []): Candidate {
  const none = {
    case: null, behavioral: null, final_case: null, final_behavioral: null,
  } as Record<InterviewKind, RubricEntry | null>;
  return {
    id,
    name,
    email: `${id}@illinois.edu`,
    stage: "interview",
    resume: null,
    panel: [],
    assignedToMe: false,
    myRubrics: none,
    completed: { case: 0, behavioral: 0, final_case: 0, final_behavioral: 0 },
    panelScores,
    flags: [],
  };
}

function score(
  kind: InterviewKind,
  total: number,
  recommendation: Recommendation | null = null,
  reviewer = "r1@illinois.edu"
): PanelScore {
  return { reviewer, kind, total, recommendation };
}

/** Both first-round rubrics in, so `panelStanding` will total them. */
function bothRubrics(caseTotal: number, behavioralTotal: number, recs: Recommendation[] = []): PanelScore[] {
  return [
    score("case", caseTotal, recs[0] ?? null),
    score("behavioral", behavioralTotal, recs[1] ?? null),
  ];
}

describe("splitSeverity", () => {
  it("is 0 when everyone recorded so far agrees", () => {
    expect(splitSeverity([])).toBe(0);
    expect(splitSeverity(["yes"])).toBe(0);
    expect(splitSeverity(["yes", "yes"])).toBe(0);
  });

  it("is 1 when the recommendations differ only in degree", () => {
    expect(splitSeverity(["strong_yes", "yes"])).toBe(1);
    expect(splitSeverity(["no", "strong_no"])).toBe(1);
  });

  it("is 2 when one says advance and another says reject", () => {
    expect(splitSeverity(["yes", "no"])).toBe(2);
    expect(splitSeverity(["strong_yes", "strong_no"])).toBe(2);
    // The real mismatch outranks the shade of agreement sitting next to it.
    expect(splitSeverity(["strong_yes", "yes", "no"])).toBe(2);
  });

  it("puts each recommendation on exactly one side", () => {
    expect(recommendationSide("strong_yes")).toBe(1);
    expect(recommendationSide("yes")).toBe(1);
    expect(recommendationSide("no")).toBe(-1);
    expect(recommendationSide("strong_no")).toBe(-1);
  });
});

describe("sortBoard", () => {
  // Ada: fully scored, strong, agreed.        24 / 32
  const ada = candidate("a", "Ada", bothRubrics(12, 12, ["yes", "yes"]));
  // Bo: fully scored, weaker, and contested — one yes, one no.  16 / 32
  const bo = candidate("b", "Bo", bothRubrics(8, 8, ["yes", "no"]));
  // Cy: only the case is in, so there is no comparable total.
  const cy = candidate("c", "Cy", [score("case", 15, "strong_yes")]);
  // Dee: nobody has interviewed her yet.
  const dee = candidate("d", "Dee", []);
  const board = [dee, bo, cy, ada];

  const ids = (cs: Candidate[]) => cs.map((c) => c.id);

  it("orders by name by default, without tiering the list", () => {
    expect(ids(sortBoard(board, FIRST))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortBoard(board, FIRST, "name"))).toEqual(["a", "b", "c", "d"]);
  });

  it("ranks by the panel's total, highest first", () => {
    expect(ids(sortBoard(board, FIRST, "score")).slice(0, 2)).toEqual(["a", "b"]);
  });

  it("sinks a half-scored candidate below every fully-scored one", () => {
    // Cy's single 15 is the best number on the board, but it is half a round —
    // ranking on it would put him above a candidate who actually scored higher.
    expect(ids(sortBoard(board, FIRST, "score"))).toEqual(["a", "b", "c", "d"]);
  });

  it("puts an unscored candidate last in both working orders", () => {
    for (const order of ["score", "split"] as const) {
      expect(ids(sortBoard(board, FIRST, order)).at(-1)).toBe("d");
    }
  });

  it("surfaces a yes/no mismatch first, ahead of the higher scorer", () => {
    expect(ids(sortBoard(board, FIRST, "split"))[0]).toBe("b");
  });

  it("ranks a real mismatch above a difference of degree", () => {
    const shade = candidate("e", "Eve", bothRubrics(14, 14, ["strong_yes", "yes"]));
    const mismatch = candidate("f", "Fay", bothRubrics(5, 5, ["yes", "no"]));
    expect(ids(sortBoard([shade, mismatch], FIRST, "split"))).toEqual(["f", "e"]);
  });

  it("counts two interviewers disagreeing on the SAME rubric as a mismatch", () => {
    const contested = candidate("g", "Gus", [
      score("case", 12, "yes", "r1@illinois.edu"),
      score("case", 4, "no", "r2@illinois.edu"),
      score("behavioral", 10, "yes"),
    ]);
    const agreed = candidate("h", "Hana", bothRubrics(12, 12, ["yes", "yes"]));
    expect(ids(sortBoard([agreed, contested], FIRST, "split"))).toEqual(["g", "h"]);
  });

  it("breaks every tie by name, so the order is stable", () => {
    const zoe = candidate("z", "Zoe", bothRubrics(10, 10, ["yes", "yes"]));
    const abe = candidate("y", "Abe", bothRubrics(10, 10, ["yes", "yes"]));
    for (const order of ["name", "score", "split"] as const) {
      expect(ids(sortBoard([zoe, abe], FIRST, order))).toEqual(["y", "z"]);
    }
  });

  it("does not mutate the board it was given", () => {
    const input = [dee, bo, cy, ada];
    sortBoard(input, FIRST, "score");
    expect(ids(input)).toEqual(["d", "b", "c", "a"]);
  });

  it("orders the final round on its own rubrics", () => {
    // Same shape, different kinds — a first-round score must not count here.
    const strong = candidate("i", "Ida", [
      score("final_case", 14, "yes"),
      score("final_behavioral", 16, "yes"),
    ]);
    const stale = candidate("j", "Jo", bothRubrics(15, 17, ["strong_yes", "strong_yes"]));
    expect(ids(sortBoard([stale, strong], ROUND_KINDS.final_round, "score"))).toEqual(["i", "j"]);
  });
});
