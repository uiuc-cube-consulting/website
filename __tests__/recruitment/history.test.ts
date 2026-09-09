/**
 * Scores outliving the round that recorded them.
 *
 * Each round used to end and take its numbers with it: the first-round panel
 * could not see the written marks that put a candidate in front of them, and the
 * final-round panel — the one that decides an offer — saw a group case out of 12
 * and nothing else. `lib/history.ts` carries the earlier rounds forward.
 *
 * These pin the parts that are easy to get quietly wrong:
 *   · which sheets belong to which round, and that a LATER round never leaks
 *     backwards into an earlier round's board
 *   · a review scored under the retired written rubric reads as "not scored"
 *     rather than as a 0/28
 *   · a round total stays null until every sheet in it has been scored
 *   · notes written before the number off the paper sheet still show up
 */

import {
  ROUND_SHEETS,
  hasHistory,
  historyFrom,
  sheetKind,
  sheetLabel,
  sheetMax,
  sheetTotal,
  sheetsOfRounds,
  type HistoryRow,
} from "@/features/03-recruitment-ats/lib/history";
import {
  ROUNDS,
  ROUND_SHORT,
  priorRounds,
  type Round,
} from "@/features/03-recruitment-ats/lib/rounds";
import { ROUND_KINDS, rubricMax } from "@/features/03-recruitment-ats/lib/interview";
import { RUBRIC, SCREEN_MAX_POINTS, type RubricKey, type Scores } from "@/features/03-recruitment-ats/lib/types";
import { getBoard } from "@/features/03-recruitment-ats/lib/interview-store";

/** A complete written review that totals to `total`, spread over the criteria. */
function screenScores(total: number): Scores {
  const out = {} as Scores;
  let left = total;
  for (const c of RUBRIC) {
    const give = Math.min(c.max, Math.max(0, left));
    out[c.key] = give;
    left -= give;
  }
  return out;
}

const row = (r: Partial<HistoryRow> & { reviewer_email: string }): HistoryRow => ({
  kind: "screen",
  scores: {},
  notes: "",
  recommendation: null,
  created_at: "2026-09-07T00:00:00Z",
  ...r,
});

// ── Which rounds count as "earlier" ──────────────────────────────────────────

describe("priorRounds", () => {
  it("gives every round that comes before, oldest first", () => {
    expect(priorRounds("written")).toEqual([]);
    expect(priorRounds("first_round")).toEqual(["written"]);
    expect(priorRounds("final_round")).toEqual(["written", "first_round"]);
  });

  it("never includes the round itself or anything after it", () => {
    for (const round of ROUNDS) {
      const priors = priorRounds(round);
      expect(priors).not.toContain(round);
      const after = ROUNDS.slice(ROUNDS.indexOf(round) + 1);
      for (const later of after) expect(priors).not.toContain(later);
    }
  });
});

describe("ROUND_SHEETS", () => {
  it("covers every round", () => {
    for (const round of ROUNDS) expect(ROUND_SHEETS[round].length).toBeGreaterThan(0);
  });

  it("matches ROUND_KINDS for the two interview rounds", () => {
    expect(ROUND_SHEETS.first_round).toEqual(ROUND_KINDS.first_round);
    expect(ROUND_SHEETS.final_round).toEqual(ROUND_KINDS.final_round);
  });

  it("is the written rubric, and only that, for the written round", () => {
    expect(ROUND_SHEETS.written).toEqual(["screen"]);
  });

  it("sheetsOfRounds flattens in round order", () => {
    expect(sheetsOfRounds(priorRounds("final_round"))).toEqual(["screen", "case", "behavioral"]);
  });
});

describe("ROUND_SHORT", () => {
  it("labels every round", () => {
    for (const round of ROUNDS) expect(ROUND_SHORT[round]).toBeTruthy();
  });
});

// ── Reading a stored row ─────────────────────────────────────────────────────

describe("sheetKind", () => {
  it("reads a row with no kind as a written screen", () => {
    // Rows predating db/interview.sql carry no `kind`; lib/types.ts reads an
    // absent one the same way.
    expect(sheetKind(undefined)).toBe("screen");
    expect(sheetKind(null)).toBe("screen");
    expect(sheetKind("")).toBe("screen");
  });

  it("passes the live kinds through", () => {
    expect(sheetKind("screen")).toBe("screen");
    expect(sheetKind("case")).toBe("case");
    expect(sheetKind("behavioral")).toBe("behavioral");
    expect(sheetKind("final")).toBe("final");
  });

  it("drops the retired final-round kinds", () => {
    // db/rounds.sql keeps these rows but nothing scores them any more, and there
    // is no maximum left to show them against.
    expect(sheetKind("final_case")).toBeNull();
    expect(sheetKind("final_behavioral")).toBeNull();
  });
});

describe("sheetMax and sheetLabel", () => {
  it("gives the written rubric its own total", () => {
    expect(sheetMax("screen")).toBe(SCREEN_MAX_POINTS);
    expect(sheetLabel("screen")).toMatch(/written/i);
  });

  it("defers to the interview rubrics for the rest", () => {
    for (const kind of [...ROUND_KINDS.first_round, ...ROUND_KINDS.final_round]) {
      expect(sheetMax(kind)).toBe(rubricMax(kind));
    }
  });
});

describe("sheetTotal", () => {
  it("sums a complete written review", () => {
    expect(sheetTotal("screen", screenScores(21))).toBe(21);
    expect(sheetTotal("screen", screenScores(SCREEN_MAX_POINTS))).toBe(SCREEN_MAX_POINTS);
  });

  it("counts an honest zero as a score, not as unscored", () => {
    expect(sheetTotal("screen", screenScores(0))).toBe(0);
  });

  it("reads a review scored under the RETIRED written rubric as unscored", () => {
    // The old sheet was four 1-5 criteria. Summing what is there would total a
    // clean 0/28 and read as a devastating screen rather than as a score on a
    // rubric that no longer exists.
    const old = { problem_solving: 4, communication: 4, drive: 3, fit: 5 } as unknown as Record<string, number>;
    expect(sheetTotal("screen", old)).toBeNull();
  });

  it("treats a half-filled written review as unscored", () => {
    const partial: Partial<Record<RubricKey, number>> = { essay_1: 4, essay_2: 3 };
    expect(sheetTotal("screen", partial as Record<string, number>)).toBeNull();
  });

  it("takes an interview total off the sheet, halves included", () => {
    expect(sheetTotal("case", { total: 12 })).toBe(12);
    expect(sheetTotal("behavioral", { total: 13.5 })).toBe(13.5);
    expect(sheetTotal("final", { total: 0 })).toBe(0);
  });

  it("refuses an interview total outside the rubric", () => {
    expect(sheetTotal("case", { total: rubricMax("case") + 1 })).toBeNull();
    expect(sheetTotal("case", { total: -1 })).toBeNull();
    expect(sheetTotal("case", {})).toBeNull();
  });
});

// ── Grouping rows into earlier rounds ────────────────────────────────────────

describe("historyFrom", () => {
  const rows: HistoryRow[] = [
    row({ reviewer_email: "Sujan@cubeconsulting.org", kind: "screen", scores: screenScores(22), notes: "Strong leadership signal." }),
    row({ reviewer_email: "neha@cubeconsulting.org", kind: "screen", scores: screenScores(20), notes: "" }),
    row({ reviewer_email: "sujan@cubeconsulting.org", kind: "case", scores: { total: 12 }, notes: "Recovered after the breakeven.", recommendation: "yes" }),
    row({ reviewer_email: "isabella@cubeconsulting.org", kind: "behavioral", scores: { total: 14 }, notes: "", recommendation: "strong_yes" }),
    // The round being worked. Must never appear in its own history.
    row({ reviewer_email: "sujan@cubeconsulting.org", kind: "final", scores: { total: 9 }, notes: "Led the group." }),
  ];

  it("returns one entry per requested round, in order", () => {
    const h = historyFrom(rows, priorRounds("final_round"));
    expect(h.map((r) => r.round)).toEqual(["written", "first_round"]);
  });

  it("never carries the round being worked, or any later one", () => {
    const h = historyFrom(rows, priorRounds("final_round"));
    expect(JSON.stringify(h)).not.toContain("final");
    for (const r of h) {
      for (const sc of r.scores) expect(sc.kind).not.toBe("final");
    }
  });

  it("averages the written round across its readers", () => {
    const [written] = historyFrom(rows, priorRounds("first_round"));
    expect(written.sheets).toHaveLength(1);
    expect(written.sheets[0].mean).toBe(21);
    expect(written.sheets[0].n).toBe(2);
    expect(written.total).toBe(21);
    expect(written.max).toBe(SCREEN_MAX_POINTS);
  });

  it("adds the first round's two sheets rather than averaging them", () => {
    // 12/15 case + 14/17 behavioral = 26/32. Two rubrics measuring different
    // things, exactly as `panelStanding` treats the live round.
    const h = historyFrom(rows, priorRounds("final_round"));
    const first = h.find((r) => r.round === "first_round")!;
    expect(first.total).toBe(26);
    expect(first.max).toBe(rubricMax("case") + rubricMax("behavioral"));
  });

  it("withholds a round total until every sheet in it is scored", () => {
    // A strong candidate with only the case in would otherwise read as 12/32,
    // which looks like a rejection.
    const caseOnly = [rows[2]];
    const first = historyFrom(caseOnly, ["first_round"])[0];
    expect(first.sheets.find((s) => s.kind === "case")!.mean).toBe(12);
    expect(first.sheets.find((s) => s.kind === "behavioral")!.mean).toBeNull();
    expect(first.total).toBeNull();
    expect(first.scores).toHaveLength(1);
  });

  it("lowercases reviewers and lists them once, alphabetically", () => {
    const [written] = historyFrom(rows, ["written"]);
    expect(written.reviewers).toEqual([
      "neha@cubeconsulting.org",
      "sujan@cubeconsulting.org",
    ]);
  });

  it("keeps notes written before the number off the paper sheet", () => {
    const unscored = [row({ reviewer_email: "neha@cubeconsulting.org", kind: "case", scores: {}, notes: "Wrote this up straight after the room." })];
    const first = historyFrom(unscored, ["first_round"])[0];
    expect(first.scores).toHaveLength(1);
    expect(first.scores[0].total).toBeNull();
    expect(first.scores[0].notes).toContain("straight after the room");
  });

  it("drops a row that carries neither a score nor a sentence", () => {
    const empty = [row({ reviewer_email: "neha@cubeconsulting.org", kind: "case", scores: {}, notes: "   " })];
    expect(historyFrom(empty, ["first_round"])[0].scores).toHaveLength(0);
  });

  it("returns an unscored round rather than omitting it", () => {
    // Somebody advanced this candidate by hand. That is worth seeing; an absent
    // round is indistinguishable from a console that never looked.
    const h = historyFrom([], priorRounds("final_round"));
    expect(h.map((r) => r.round)).toEqual(["written", "first_round"]);
    expect(h.every((r) => r.scores.length === 0 && r.total === null)).toBe(true);
    expect(hasHistory(h)).toBe(false);
  });

  it("carries per-criterion means for the written round only", () => {
    const h = historyFrom(rows, priorRounds("final_round"));
    const written = h.find((r) => r.round === "written")!;
    const first = h.find((r) => r.round === "first_round")!;
    expect(first.criteria).toBeUndefined();
    expect(written.criteria).toHaveLength(RUBRIC.length);
    // screenScores fills from the top: essay_1 is maxed in both reviews.
    expect(written.criteria!.find((c) => c.key === "essay_1")!.mean).toBe(5);
    // 22 and 20 both run out before `resume`, so it is a scored 0 in both.
    expect(written.criteria!.find((c) => c.key === "resume")!.mean).toBe(0);
  });

  it("reads a kindless row into the written round", () => {
    const legacy = [row({ reviewer_email: "old@cubeconsulting.org", kind: undefined, scores: screenScores(18), notes: "" })];
    const [written] = historyFrom(legacy, ["written"]);
    expect(written.total).toBe(18);
  });

  it("hasHistory is true as soon as one round has anything", () => {
    expect(hasHistory(historyFrom(rows, priorRounds("first_round")))).toBe(true);
    expect(hasHistory(undefined)).toBe(false);
  });
});

// ── End to end, through the real board ───────────────────────────────────────
// Demo fixture (lib/demo.ts): `a9` Nikhil Rao is in the final round with two
// written screens (25 and 23 -> 24/28) and a first round of 12/15 + 14/17.

describe("getBoard carries the earlier rounds", () => {
  it("gives a first-round candidate their written score", async () => {
    const board = await getBoard("newcomer@illinois.edu", false, "first_round");
    const jordan = board.candidates.find((c) => c.email === "jellis@illinois.edu")!;
    expect(jordan.history!.map((h) => h.round)).toEqual(["written"]);
    expect(jordan.history![0].total).toBe(21);
  });

  it("gives a final-round candidate the written round AND the first", async () => {
    const board = await getBoard("newcomer@illinois.edu", true, "final_round");
    const nikhil = board.candidates.find((c) => c.email === "nrao@illinois.edu")!;
    expect(nikhil.history!.map((h) => h.round)).toEqual(["written", "first_round"]);
    expect(nikhil.history!.find((h) => h.round === "written")!.total).toBe(24);
    expect(nikhil.history!.find((h) => h.round === "first_round")!.total).toBe(26);
  });

  it("still never sends a later round's scores backwards", async () => {
    // The whole point of scoping the fetch: a first-round board carries what
    // came before it and nothing that comes after.
    const board = await getBoard("newcomer@illinois.edu", false, "first_round");
    for (const c of board.candidates) {
      for (const h of c.history ?? []) {
        expect(["written"] as Round[]).toContain(h.round);
      }
    }
  });
});
