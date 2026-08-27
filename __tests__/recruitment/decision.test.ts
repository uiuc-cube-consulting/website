/**
 * The exec final-decision queue.
 *
 * The property that matters most here is the one about disagreement: the mean of
 * a 4.5 and a 1.5 is a perfectly ordinary 3.0, so the two candidates reviewers
 * fought hardest over are exactly the ones easiest to skim past. The queue has to
 * surface that separately from the score.
 */

import {
  buildDecisionQueue,
  sortDecisionQueue,
  summarizeQueue,
  DISAGREEMENT_THRESHOLD,
} from "@/features/03-recruitment-ats/lib/decision";
import type { Applicant, Review, Scores } from "@/features/03-recruitment-ats/lib/types";

function applicant(id: string, name: string, stage = "applied"): Applicant {
  return {
    id, name, email: `${id}@illinois.edu`, created_at: "2026-01-01",
    responses: {}, stage: stage as Applicant["stage"],
  };
}

function review(applicant_id: string, reviewer: string, score: number, kind?: Review["kind"], notes = ""): Review {
  const scores = {
    problem_solving: score, communication: score, drive: score, fit: score,
  } as Scores;
  return {
    id: `${applicant_id}-${reviewer}`, created_at: "2026-02-01",
    applicant_id, reviewer_email: reviewer, scores,
    weighted_total: score, notes, kind,
  };
}

const A = applicant("a1", "Alice");
const B = applicant("a2", "Bob");
const C = applicant("a3", "Cara");

describe("buildDecisionQueue", () => {
  it("unblinds every reviewer's verdict, strongest first", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 2, "screen", "not convinced"),
      review("a1", "r2@x.edu", 5, "screen", "outstanding"),
    ]);
    expect(row.verdicts).toHaveLength(2);
    expect(row.verdicts[0].reviewer_email).toBe("r2@x.edu");
    expect(row.verdicts[0].notes).toBe("outstanding");
    expect(row.verdicts[1].notes).toBe("not convinced");
  });

  it("is not ready until the minimum number of reads is in", () => {
    const [one] = buildDecisionQueue([A], [review("a1", "r1@x.edu", 4)]);
    expect(one.ready).toBe(false);
    expect(one.awaiting).toBe(1);

    const [two] = buildDecisionQueue([A], [review("a1", "r1@x.edu", 4), review("a1", "r2@x.edu", 3)]);
    expect(two.ready).toBe(true);
    expect(two.awaiting).toBe(0);
  });

  it("ignores interview rubrics — those belong to the next round", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 4, "screen"),
      review("a1", "r2@x.edu", 5, "case"),
      review("a1", "r3@x.edu", 5, "behavioral"),
    ]);
    expect(row.reviewCount).toBe(1);
    expect(row.ready).toBe(false);
  });

  it("counts a legacy review with no kind as a screen", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 4, undefined), review("a1", "r2@x.edu", 4, undefined),
    ]);
    expect(row.ready).toBe(true);
  });

  it("computes mean, spread and per-criterion means", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 2), review("a1", "r2@x.edu", 4),
    ]);
    expect(row.mean).toBe(3);
    expect(row.spread).toBe(2);
    expect(row.perCriterion.problem_solving).toBe(3);
  });

  it("reports no spread for a single review, rather than zero", () => {
    // Zero would read as perfect agreement; there is nothing to agree with yet.
    const [row] = buildDecisionQueue([A], [review("a1", "r1@x.edu", 4)]);
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
      review("a1", "r1@x.edu", 4.5), review("a1", "r2@x.edu", 1.5),
    ]);
    expect(row.mean).toBe(3); // indistinguishable from two middling 3s
    expect(row.spread).toBe(3);
    expect(row.disagreement).toBe(true);
  });

  it("does not flag reviewers who merely differ by degree", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 4), review("a1", "r2@x.edu", 3.4),
    ]);
    expect(row.spread).toBeLessThan(DISAGREEMENT_THRESHOLD);
    expect(row.disagreement).toBe(false);
  });

  it("treats the threshold as inclusive", () => {
    const [row] = buildDecisionQueue([A], [
      review("a1", "r1@x.edu", 4), review("a1", "r2@x.edu", 4 - DISAGREEMENT_THRESHOLD),
    ]);
    expect(row.disagreement).toBe(true);
  });
});

describe("sortDecisionQueue", () => {
  const rows = buildDecisionQueue([A, B, C], [
    // Alice: ready, middling, contested
    review("a1", "r1@x.edu", 4.5), review("a1", "r2@x.edu", 1.5),
    // Bob: ready, strong, agreed
    review("a2", "r1@x.edu", 4.6), review("a2", "r2@x.edu", 4.4),
    // Cara: one read only
    review("a3", "r1@x.edu", 5),
  ]);

  it("always puts decidable candidates first", () => {
    // Cara scores 5 but is not decidable, so she cannot lead.
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
    review("a1", "r1@x.edu", 4.5), review("a1", "r2@x.edu", 1.5),
    review("a2", "r1@x.edu", 4.6), review("a2", "r2@x.edu", 4.4),
    review("a3", "r1@x.edu", 5),
  ]);

  it("counts what is decidable, waiting, and contested", () => {
    const s = summarizeQueue(rows);
    expect(s).toMatchObject({ total: 3, ready: 2, awaitingReviews: 1, disagreements: 1, undecided: 2 });
  });

  it("subtracts candidates already decided", () => {
    expect(summarizeQueue(rows, new Set(["a2"])).undecided).toBe(1);
  });
});
