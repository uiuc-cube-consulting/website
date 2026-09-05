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
  boardRows,
  panelNotesFrom,
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

// ── Numbering ────────────────────────────────────────────────────────────────
/**
 * The numbers down the left of the console.
 *
 * They exist to make a cutoff visible: order by score, read down, and the line
 * you stop at has a number on it. That only works if a position means "place in
 * the board" and keeps meaning it — which is why these are asserted through the
 * search filter, the one operation that could quietly renumber the list under
 * someone mid-decision.
 */
describe("boardRows", () => {
  const ada = candidate("a", "Ada Zheng", bothRubrics(12, 12, ["yes", "yes"])); // 24 / 32
  const bo = candidate("b", "Bo Adams", bothRubrics(8, 8, ["yes", "yes"])); //    16 / 32
  const cy = candidate("c", "Cy Jordan", bothRubrics(14, 14, ["yes", "yes"])); // 28 / 32
  const board = [ada, bo, cy];

  const shown = (rows: ReturnType<typeof boardRows>) =>
    rows.map((r) => [r.position, r.candidate.id] as const);

  it("numbers the board from 1, in the order on screen", () => {
    expect(shown(boardRows(board, FIRST, "name", ""))).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
    // Highest score first: Cy 28, Ada 24, Bo 16 — and #1 is now the top scorer.
    expect(shown(boardRows(board, FIRST, "score", ""))).toEqual([
      [1, "c"],
      [2, "a"],
      [3, "b"],
    ]);
  });

  it("keeps a candidate's board position when a search narrows the list", () => {
    // Bo is third by score. Searching for him must not make him #1 — the number
    // is where he stands in the round, not where he stands among the matches.
    expect(shown(boardRows(board, FIRST, "score", "bo"))).toEqual([[3, "b"]]);
  });

  it("orders matches by how well they match, numbers and all", () => {
    // "jordan" is Cy's surname and Ada's nothing; only Cy comes back, at his
    // own position.
    expect(shown(boardRows(board, FIRST, "score", "jordan"))).toEqual([[1, "c"]]);
    // A query matching two puts the better match first while both keep their
    // numbers: "ada" is a full-name prefix for Ada (#2) and a surname for Bo (#3).
    expect(shown(boardRows(board, FIRST, "score", "ada"))).toEqual([
      [2, "a"],
      [3, "b"],
    ]);
  });

  it("numbers the pool it is given — the scope filter is the caller's job", () => {
    expect(shown(boardRows([bo], FIRST, "score", ""))).toEqual([[1, "b"]]);
  });

  it("returns nothing, rather than a stray number, when nothing matches", () => {
    expect(boardRows(board, FIRST, "name", "nobody")).toEqual([]);
    expect(boardRows([], FIRST, "score", "")).toEqual([]);
  });

  it("ignores surrounding whitespace in the query", () => {
    expect(shown(boardRows(board, FIRST, "score", "  bo  "))).toEqual([[3, "b"]]);
  });
});

// ── Panel notes ──────────────────────────────────────────────────────────────
/**
 * What the panel WROTE, as opposed to what it scored.
 *
 * The scores table says what the panel thought; the notes say why. The rule
 * worth pinning is the one that is easy to get backwards: notes do not depend
 * on a score, because the write-up happens straight after the room and the
 * number gets transcribed off the paper rubric later. A filter keyed on the
 * score would blank this section during exactly the window where it is the only
 * thing anyone has.
 */
describe("panelNotesFrom", () => {
  const row = (over: Partial<Parameters<typeof panelNotesFrom>[0][number]> = {}) => ({
    reviewer_email: "R1@illinois.edu",
    kind: "case",
    scores: { total: 12 },
    notes: "Drove the structure, lost the maths, recovered.",
    recommendation: "yes",
    created_at: "2026-09-04T18:00:00.000Z",
    ...over,
  });

  it("carries a note, its score and its verdict", () => {
    expect(panelNotesFrom([row()], FIRST)).toEqual([
      {
        reviewer: "r1@illinois.edu",
        kind: "case",
        notes: "Drove the structure, lost the maths, recovered.",
        total: 12,
        recommendation: "yes",
        at: "2026-09-04T18:00:00.000Z",
      },
    ]);
  });

  it("keeps the notes when the score has not been entered yet", () => {
    // The hour after an interview: written up, not yet transcribed.
    const [note] = panelNotesFrom([row({ scores: null, recommendation: null })], FIRST);
    expect(note.notes).toContain("Drove the structure");
    expect(note.total).toBeNull();
  });

  it("keeps them when the score is present but unusable", () => {
    // Out of range for the case rubric (max 15), so `submittedTotal` refuses it
    // — the note is still what the interviewer wrote.
    expect(panelNotesFrom([row({ scores: { total: 99 } })], FIRST)[0].total).toBeNull();
  });

  it("drops a row that says nothing", () => {
    expect(panelNotesFrom([row({ notes: "" })], FIRST)).toEqual([]);
    expect(panelNotesFrom([row({ notes: "   \n  " })], FIRST)).toEqual([]);
    expect(panelNotesFrom([row({ notes: null })], FIRST)).toEqual([]);
  });

  it("trims what it keeps", () => {
    expect(panelNotesFrom([row({ notes: "  said it  " })], FIRST)[0].notes).toBe("said it");
  });

  it("normalises the reviewer, so one person is one column", () => {
    const notes = panelNotesFrom([row(), row({ reviewer_email: "r1@ILLINOIS.edu" })], FIRST);
    expect(new Set(notes.map((n) => n.reviewer)).size).toBe(1);
  });

  it("never lets one round's notes into another's board", () => {
    // The final round is exec-only in every direction. A first-round note must
    // not surface there, and a final-round note must never reach a first-round
    // response — which is what the kind filter is for.
    const finalNote = row({ kind: "final_case" });
    expect(panelNotesFrom([finalNote], FIRST)).toEqual([]);
    expect(panelNotesFrom([row()], ROUND_KINDS.final_round)).toEqual([]);
    expect(panelNotesFrom([finalNote], ROUND_KINDS.final_round)).toHaveLength(1);
  });
});
