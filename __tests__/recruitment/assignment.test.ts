/**
 * Reviewer coverage + manual rerouting.
 *
 * Two rules from the recruiting process are encoded here and worth stating:
 *   1. every written application gets at least MIN_REVIEWERS_PER_APPLICANT (2)
 *      independent reads, and
 *   2. exec can reroute a candidate onto someone who is actually in the room,
 *      without that becoming a way to quietly drop below rule 1.
 */

import {
  computeCoverage,
  summarizeCoverage,
  validateReassignment,
  suggestReviewers,
  MIN_REVIEWERS_PER_APPLICANT,
} from "@/features/03-recruitment-ats/lib/assignment";
import type { Review } from "@/features/03-recruitment-ats/lib/types";

const APPLICANTS = [
  { id: "a1", name: "Alice", email: "alice@illinois.edu", stage: "applied" },
  { id: "a2", name: "Bob", email: "bob@illinois.edu", stage: "applied" },
  { id: "a3", name: "Cara", email: "cara@illinois.edu", stage: "screened" },
];

const POOL = ["r1@illinois.edu", "r2@illinois.edu", "r3@illinois.edu", "r4@illinois.edu"];

function review(applicant_id: string, reviewer_email: string, kind?: Review["kind"]): Review {
  return {
    id: `${applicant_id}-${reviewer_email}`,
    created_at: "2026-01-01",
    applicant_id,
    reviewer_email,
    scores: { essay_1: 3, essay_2: 2, essay_3: 2, case_essay: 4, misc: 3, resume: 3 },
    weighted_total: 17,
    kind,
  };
}

describe("computeCoverage", () => {
  const assignments = [
    { applicant_id: "a1", reviewer_email: "r1@illinois.edu" },
    { applicant_id: "a1", reviewer_email: "r2@illinois.edu" },
    { applicant_id: "a2", reviewer_email: "r1@illinois.edu" },
    // a3 has nobody
  ];
  const reviews = [review("a1", "r1@illinois.edu")];

  const rows = computeCoverage(APPLICANTS, assignments, reviews);
  const byId = Object.fromEntries(rows.map((r) => [r.applicant_id, r]));

  it("counts assigned and reviewed separately", () => {
    expect(byId.a1.assigned).toHaveLength(2);
    expect(byId.a1.reviewed).toEqual(["r1@illinois.edu"]);
  });

  it("names who still owes a review", () => {
    // Being assigned is not the same as having delivered.
    expect(byId.a1.outstanding).toEqual(["r2@illinois.edu"]);
    expect(byId.a1.underAssigned).toBe(false);
    expect(byId.a1.underReviewed).toBe(true);
  });

  it("flags a candidate with too few reviewers assigned", () => {
    expect(byId.a2.underAssigned).toBe(true);
    expect(byId.a3.assigned).toEqual([]);
    expect(byId.a3.underAssigned).toBe(true);
  });

  it("is case-insensitive about reviewer emails", () => {
    const r = computeCoverage(
      [APPLICANTS[0]],
      [{ applicant_id: "a1", reviewer_email: "R1@Illinois.EDU" }],
      [review("a1", "r1@illinois.edu")]
    );
    expect(r[0].reviewed).toEqual(["r1@illinois.edu"]);
    expect(r[0].outstanding).toEqual([]); // matched despite the casing
  });

  /**
   * The load-bearing one. Interview rubrics score a different rubric at a later
   * stage; if they counted here a candidate could reach finals on a single
   * written read.
   */
  it("does not let interview rubrics satisfy the written-application minimum", () => {
    const r = computeCoverage(
      [APPLICANTS[0]],
      [{ applicant_id: "a1", reviewer_email: "r1@illinois.edu" }],
      [review("a1", "r1@illinois.edu", "case"), review("a1", "r2@illinois.edu", "behavioral")]
    );
    expect(r[0].reviewed).toEqual([]);
    expect(r[0].underReviewed).toBe(true);
  });

  it("counts a legacy review with no kind as a screen", () => {
    const r = computeCoverage([APPLICANTS[0]], [], [review("a1", "r1@illinois.edu", undefined)]);
    expect(r[0].reviewed).toEqual(["r1@illinois.edu"]);
  });

  it("summarizes the gaps", () => {
    const s = summarizeCoverage(rows);
    expect(s.total).toBe(3);
    expect(s.fullyAssigned).toBe(1); // only a1
    expect(s.underAssigned.map((r) => r.applicant_id).sort()).toEqual(["a2", "a3"]);
    expect(s.fullyReviewed).toBe(0);
  });
});

describe("validateReassignment", () => {
  const applicant = { id: "a1", email: "alice@illinois.edu" };
  const assigned = ["r1@illinois.edu", "r2@illinois.edu"];
  const v = (input: Parameters<typeof validateReassignment>[0]) =>
    validateReassignment(input, applicant, assigned, POOL);

  it("adds an eligible reviewer", () => {
    expect(v({ action: "add", applicant_id: "a1", to: "r3@illinois.edu" }).ok).toBe(true);
  });

  it("refuses someone outside the reviewer pool", () => {
    const r = v({ action: "add", applicant_id: "a1", to: "stranger@illinois.edu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not an eligible reviewer/i);
  });

  it("refuses to let a candidate review their own application", () => {
    const r = v({ action: "add", applicant_id: "a1", to: "alice@illinois.edu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/own application/i);
  });

  /**
   * The case that makes the self-review rule load-bearing rather than
   * theoretical: a returning member who reapplies IS in the reviewer pool, so
   * eligibility passes and only this check stops them scoring themselves.
   */
  it("blocks self-review even when the candidate is an eligible reviewer", () => {
    const memberApplicant = { id: "a9", email: "r2@illinois.edu" };
    const r = validateReassignment(
      { action: "add", applicant_id: "a9", to: "r2@illinois.edu" },
      memberApplicant,
      ["r1@illinois.edu"],
      POOL
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/own application/i);
  });

  it("refuses a duplicate assignment", () => {
    const r = v({ action: "add", applicant_id: "a1", to: "R1@Illinois.edu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already assigned/i);
  });

  it("refuses to remove someone who was never assigned", () => {
    const r = v({ action: "remove", applicant_id: "a1", from: "r4@illinois.edu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not assigned/i);
  });

  /** Rule 1 must survive rule 2. */
  it("blocks a removal that would drop the candidate below the minimum", () => {
    const r = v({ action: "remove", applicant_id: "a1", from: "r1@illinois.edu" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(new RegExp(`minimum of ${MIN_REVIEWERS_PER_APPLICANT}`));
  });

  it("allows that removal when explicitly forced", () => {
    expect(v({ action: "remove", applicant_id: "a1", from: "r1@illinois.edu", force: true }).ok).toBe(true);
  });

  it("allows a removal that stays at or above the minimum", () => {
    const three = ["r1@illinois.edu", "r2@illinois.edu", "r3@illinois.edu"];
    const r = validateReassignment(
      { action: "remove", applicant_id: "a1", from: "r1@illinois.edu" }, applicant, three, POOL);
    expect(r.ok).toBe(true);
  });

  /**
   * The absent-reviewer case: swap holds the count constant, so it is allowed
   * even at exactly the minimum, where a bare remove would be refused.
   */
  it("allows a swap at the minimum, since the seat is refilled", () => {
    const r = v({ action: "swap", applicant_id: "a1", from: "r1@illinois.edu", to: "r3@illinois.edu" });
    expect(r.ok).toBe(true);
  });

  it("still validates both halves of a swap", () => {
    expect(v({ action: "swap", applicant_id: "a1", from: "r4@illinois.edu", to: "r3@illinois.edu" }).ok).toBe(false);
    expect(v({ action: "swap", applicant_id: "a1", from: "r1@illinois.edu", to: "stranger@x.edu" }).ok).toBe(false);
    expect(v({ action: "swap", applicant_id: "a1", from: "r1@illinois.edu", to: "r1@illinois.edu" }).ok).toBe(false);
  });

  it("requires the fields each action needs", () => {
    expect(v({ action: "add", applicant_id: "a1" }).ok).toBe(false);
    expect(v({ action: "remove", applicant_id: "a1" }).ok).toBe(false);
  });

  it("refuses an unknown applicant", () => {
    expect(validateReassignment({ action: "add", applicant_id: "zz", to: "r3@illinois.edu" }, undefined, [], POOL).ok).toBe(false);
  });
});

describe("suggestReviewers", () => {
  it("offers the least-loaded eligible reviewers first", () => {
    const all = [
      { applicant_id: "x", reviewer_email: "r3@illinois.edu" },
      { applicant_id: "y", reviewer_email: "r3@illinois.edu" },
      { applicant_id: "z", reviewer_email: "r4@illinois.edu" },
    ];
    const out = suggestReviewers(
      { id: "a1", email: "alice@illinois.edu" }, ["r1@illinois.edu"], POOL, all);
    // r2 has no load at all, so it leads; r3 carries two and trails.
    expect(out[0].email).toBe("r2@illinois.edu");
    expect(out.map((o) => o.email)).not.toContain("r1@illinois.edu"); // already on
    expect(out[out.length - 1].email).toBe("r3@illinois.edu");
  });

  it("never suggests the candidate themselves", () => {
    const out = suggestReviewers(
      { id: "a1", email: "r2@illinois.edu" }, [], POOL, []);
    expect(out.map((o) => o.email)).not.toContain("r2@illinois.edu");
  });
});

describe("the minimum is a floor, not a quota", () => {
  // Candidates get topped up to MIN reviewers, but exec can add a third — for a
  // contested application, or because someone was rerouted. Once MIN independent
  // reads are in, that candidate is decidable and the work on them is DONE,
  // however many people happen to be assigned.
  const applicants = [{ id: "a1", name: "Alice", email: "alice@illinois.edu", stage: "applied" }];
  const threeAssigned = [
    { applicant_id: "a1", reviewer_email: "r1@illinois.edu" },
    { applicant_id: "a1", reviewer_email: "r2@illinois.edu" },
    { applicant_id: "a1", reviewer_email: "r3@illinois.edu" },
  ];

  it("counts a candidate done at MIN reviews even with a third assignee", () => {
    const rows = computeCoverage(applicants, threeAssigned, [
      review("a1", "r1@illinois.edu"),
      review("a1", "r2@illinois.edu"),
    ]);
    expect(rows[0].underReviewed).toBe(false);
    // And nobody is left to chase. The third reviewer is not holding anything
    // up, so listing them keeps a finished candidate looking outstanding
    // forever — the reviewer has no reason to act, the item never clears, and a
    // to-do list that never empties stops being read.
    expect(rows[0].outstanding).toEqual([]);
  });

  it("still chases everyone while the candidate is short", () => {
    const rows = computeCoverage(applicants, threeAssigned, [review("a1", "r1@illinois.edu")]);
    expect(rows[0].underReviewed).toBe(true);
    expect(rows[0].outstanding).toEqual(["r2@illinois.edu", "r3@illinois.edu"]);
  });

  it("keeps a three-assignee candidate out of the coverage gap list", () => {
    const rows = computeCoverage(applicants, threeAssigned, [
      review("a1", "r1@illinois.edu"),
      review("a1", "r3@illinois.edu"),
    ]);
    const summary = summarizeCoverage(rows);
    expect(summary.fullyReviewed).toBe(1);
    expect(summary.underReviewed).toEqual([]);
  });

  it("counts a review from someone never assigned", () => {
    // An exec override is still an eye on the candidate. Two reads is two reads.
    const rows = computeCoverage(applicants, [threeAssigned[0]], [
      review("a1", "r1@illinois.edu"),
      review("a1", "exec@illinois.edu"),
    ]);
    expect(rows[0].underReviewed).toBe(false);
    expect(rows[0].outstanding).toEqual([]);
  });
});
