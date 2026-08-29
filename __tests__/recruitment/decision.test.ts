/**
 * The exec decision queue that ends the WRITTEN round.
 *
 * The property that matters most here is the one about disagreement: the mean of
 * a 21 and a 7 is a perfectly ordinary 14, so the two candidates reviewers fought
 * hardest over are exactly the ones easiest to skim past. The queue has to surface
 * that separately from the score.
 *
 * Scores are POINTS out of 28 (RUBRIC in lib/types.ts), not a 1-5 mean.
 */

import {
  buildDecisionQueue,
  sortDecisionQueue,
  summarizeQueue,
  DISAGREEMENT_THRESHOLD,
} from "@/features/03-recruitment-ats/lib/decision";
import {
  RUBRIC,
  SCREEN_MAX_POINTS,
  screenTotal,
  type Applicant,
  type Review,
  type Scores,
} from "@/features/03-recruitment-ats/lib/types";

function applicant(id: string, name: string, stage = "applied"): Applicant {
  return {
    id, name, email: `${id}@illinois.edu`, created_at: "2026-01-01",
    responses: {}, stage: stage as Applicant["stage"], cycle: "fa26",
  };
}

/**
 * A filled-in rubric totalling exactly `points`, by filling each criterion to its
 * ceiling in order. The distribution is arbitrary — these tests are about totals
 * and spreads — but it is deterministic, and every value is inside its own range,
 * so the fixtures stay ones the API would actually have accepted.
 */
function scoresFor(points: number): Scores {
  let left = points;
  const out = {} as Scores;
  for (const c of RUBRIC) {
    const v = Math.max(0, Math.min(c.max, left));
    out[c.key] = v;
    left -= v;
  }
  return out;
}

function review(applicant_id: string, reviewer: string, points: number, kind?: Review["kind"], notes = ""): Review {
  return reviewWith(applicant_id, reviewer, scoresFor(points), kind, notes);
}

function reviewWith(applicant_id: string, reviewer: string, scores: Scores, kind?: Review["kind"], notes = ""): Review {
  return {
    id: `${applicant_id}-${reviewer}`, created_at: "2026-02-01",
    applicant_id, reviewer_email: reviewer, scores,
    weighted_total: screenTotal(scores), notes, kind,
  };
}

describe("scoresFor (the fixture helper itself)", () => {
  it("produces a rubric that totals what it was asked for", () => {
    for (const points of [0, 7, 14, 21, SCREEN_MAX_POINTS]) {
      expect(screenTotal(scoresFor(points))).toBe(points);
    }
  });
});

const A = applicant("a1", "Alice");
const B = applicant("a2", "Bob");
const C = applicant("a3", "Cara");

describe("buildDecisionQueue", () => {
  it("unblinds every reviewer's verdict, strongest first", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 8, "screen", "not convinced"),
      review("a1", "r2@x.edu", 25, "screen", "outstanding"),
    ]);
    expect(row.verdicts).toHaveLength(2);
    expect(row.verdicts[0].reviewer_email).toBe("r2@x.edu");
    expect(row.verdicts[0].notes).toBe("outstanding");
    expect(row.verdicts[1].notes).toBe("not convinced");
  });

  it("is not ready until the minimum number of reads is in", () => {
    const [one] = buildDecisionQueue([A], [review("a1", "r1@x.edu", 20)]);
    expect(one.ready).toBe(false);
    expect(one.awaiting).toBe(1);

    const [two] = buildDecisionQueue([A], [review("a1", "r1@x.edu", 20), review("a1", "r2@x.edu", 17)]);
    expect(two.ready).toBe(true);
    expect(two.awaiting).toBe(0);
  });

  it("ignores interview rubrics — those belong to the later rounds", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 20, "screen"),
      review("a1", "r2@x.edu", 25, "case"),
      review("a1", "r3@x.edu", 25, "behavioral"),
      review("a1", "r4@x.edu", 25, "final_case"),
      review("a1", "r5@x.edu", 25, "final_behavioral"),
    ]);
    expect(row.reviewCount).toBe(1);
    expect(row.ready).toBe(false);
  });

  it("counts a legacy review with no kind as a screen", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 20, undefined), review("a1", "r2@x.edu", 20, undefined),
    ]);
    expect(row.ready).toBe(true);
  });

  it("computes mean, spread and per-criterion means, in points", () => {
    const [row] = buildDecisionQueue([A], [
      reviewWith("a1", "r1@x.edu", { essay_1: 2, essay_2: 1, essay_3: 1, case_essay: 3, misc: 2, resume: 1 }),
      reviewWith("a1", "r2@x.edu", { essay_1: 4, essay_2: 3, essay_3: 3, case_essay: 7, misc: 4, resume: 5 }),
    ]);
    expect(row.mean).toBe(18); // (10 + 26) / 2
    expect(row.spread).toBe(16);
    expect(row.perCriterion.case_essay).toBe(5);
    expect(row.perCriterion.essay_1).toBe(3);
  });

  it("counts a scored zero, rather than dropping it as unscored", () => {
    // 0 is a real score on this rubric — an unanswered essay. Averaging it away
    // would flatter exactly the applications that left the most blank.
    const [row] = buildDecisionQueue([A], [
      reviewWith("a1", "r1@x.edu", { essay_1: 0, essay_2: 0, essay_3: 0, case_essay: 0, misc: 0, resume: 0 }),
      reviewWith("a1", "r2@x.edu", { essay_1: 4, essay_2: 0, essay_3: 0, case_essay: 0, misc: 0, resume: 0 }),
    ]);
    expect(row.perCriterion.essay_1).toBe(2); // (0 + 4) / 2, not 4
    expect(row.mean).toBe(2);
  });

  it("reports no spread for a single review, rather than zero", () => {
    // Zero would read as perfect agreement; there is nothing to agree with yet.
    const [row] = buildDecisionQueue([A], [review("a1", "r1@x.edu", 20)]);
    expect(row.spread).toBeNull();
    expect(row.disagreement).toBe(false);
  });

  it("handles a candidate nobody has reviewed", () => {
    const [row] = buildDecisionQueue([C], []);
    expect(row.reviewCount).toBe(0);
    expect(row.mean).toBeNull();
    expect(row.ready).toBe(false);
    expect(row.awaiting).toBe(2);
  });

  /** The reason the flag exists at all. */
  it("flags a split decision that an average would hide", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 21), review("a1", "r2@x.edu", 7),
    ]);
    expect(row.mean).toBe(14); // indistinguishable from two middling 14s
    expect(row.spread).toBe(14);
    expect(row.disagreement).toBe(true);
  });

  it("does not flag reviewers who merely differ by degree", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 20), review("a1", "r2@x.edu", 17),
    ]);
    expect(row.spread).toBeLessThan(DISAGREEMENT_THRESHOLD);
    expect(row.disagreement).toBe(false);
  });

  it("treats the threshold as inclusive", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 21), review("a1", "r2@x.edu", 21 - DISAGREEMENT_THRESHOLD),
    ]);
    expect(row.disagreement).toBe(true);
  });
});

describe("sortDecisionQueue", () => {
  const rows = buildDecisionQueue([A, B, C], [
    // Alice: ready, middling, contested
    review("a1", "r1@x.edu", 21), review("a1", "r2@x.edu", 7),
    // Bob: ready, strong, agreed
    review("a2", "r1@x.edu", 24), review("a2", "r2@x.edu", 22),
    // Cara: one read only
    review("a3", "r1@x.edu", 26),
  ]);

  it("always puts decidable candidates first", () => {
    // Cara scores 26 but is not decidable, so she cannot lead.
    for (const order of ["score", "disagreement", "name"] as const) {
      expect(sortDecisionQueue(rows, order).at(-1)!.applicant.id).toBe("a3");
    }
  });

  it("orders by score by default, so the cutoff is visible", () => {
    expect(sortDecisionQueue(rows, "score").map((r) => r.applicant.id)).toEqual(["a2", "a1", "a3"]);
  });

  it("can surface contested candidates first", () => {
    expect(sortDecisionQueue(rows, "disagreement")[0].applicant.id).toBe("a1");
  });

  it("can order by name", () => {
    expect(sortDecisionQueue(rows, "name").slice(0, 2).map((r) => r.applicant.name)).toEqual(["Alice", "Bob"]);
  });

  it("does not mutate its input", () => {
    const before = rows.map((r) => r.applicant.id);
    sortDecisionQueue(rows, "name");
    expect(rows.map((r) => r.applicant.id)).toEqual(before);
  });
});

describe("summarizeQueue", () => {
  const rows = buildDecisionQueue([A, B, C], [
    review("a1", "r1@x.edu", 21), review("a1", "r2@x.edu", 7),
    review("a2", "r1@x.edu", 24), review("a2", "r2@x.edu", 22),
    review("a3", "r1@x.edu", 26),
  ]);

  it("counts what is decidable, waiting, and contested", () => {
    const s = summarizeQueue(rows);
    expect(s).toMatchObject({ total: 3, ready: 2, awaitingReviews: 1, disagreements: 1, undecided: 2 });
  });

  it("subtracts candidates already decided", () => {
    expect(summarizeQueue(rows, new Set(["a2"])).undecided).toBe(1);
  });
});
