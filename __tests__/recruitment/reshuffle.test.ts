/**
 * Reshuffle vs top-up.
 *
 * `planAssignments` is the shared core. The difference between the two modes is
 * entirely what gets passed as `existing`: a top-up passes the current spread
 * (so nobody moves), a reshuffle passes only the pairs worth keeping (so
 * everyone else is dealt again).
 */

import { planAssignments } from "@/features/03-recruitment-ats/lib/types";

const applicants = [
  { id: "a1", email: "a1@x.edu" },
  { id: "a2", email: "a2@x.edu" },
  { id: "a3", email: "a3@x.edu" },
];
const reviewers = ["r1@x.edu", "r2@x.edu", "r3@x.edu", "r4@x.edu"];

// Deterministic RNG so shuffles are reproducible across runs.
const seeded = (seed: number) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

describe("top-up (the default run)", () => {
  it("adds nothing when everyone already has k", () => {
    const existing = applicants.flatMap((a) => [
      { applicant_id: a.id, reviewer_email: "r1@x.edu" },
      { applicant_id: a.id, reviewer_email: "r2@x.edu" },
    ]);
    expect(planAssignments(applicants, reviewers, existing, 2, seeded(1))).toEqual([]);
  });

  it("tops a short applicant up to k without moving the existing reviewer", () => {
    const existing = [{ applicant_id: "a1", reviewer_email: "r1@x.edu" }];
    const plan = planAssignments([applicants[0]], reviewers, existing, 2, seeded(2));
    expect(plan).toHaveLength(1);
    expect(plan[0].reviewer_email).not.toBe("r1@x.edu"); // never double-assigns
  });
});

describe("reshuffle (existing torn down first)", () => {
  it("deals a full k to everyone when nothing is preserved", () => {
    // This is what the reshuffle passes: existing = [].
    const plan = planAssignments(applicants, reviewers, [], 2, seeded(3));
    expect(plan).toHaveLength(applicants.length * 2);
    for (const a of applicants) {
      const mine = plan.filter((p) => p.applicant_id === a.id);
      expect(mine).toHaveLength(2);
      expect(new Set(mine.map((m) => m.reviewer_email)).size).toBe(2); // distinct
    }
  });

  it("can land a different spread than the one it replaced", () => {
    // The point of reshuffling: a re-deal is not obliged to reproduce the old
    // allocation. Different seeds must be able to differ.
    const a = planAssignments(applicants, reviewers, [], 2, seeded(7));
    const b = planAssignments(applicants, reviewers, [], 2, seeded(99));
    const key = (p: typeof a) =>
      p.map((x) => `${x.applicant_id}:${x.reviewer_email}`).sort().join("|");
    expect(key(a)).not.toBe(key(b));
  });

  it("spreads load evenly across the pool", () => {
    // 3 applicants x 2 reads = 6 slots over 4 reviewers -> nobody above 2.
    const plan = planAssignments(applicants, reviewers, [], 2, seeded(11));
    const load = new Map<string, number>();
    for (const p of plan) load.set(p.reviewer_email, (load.get(p.reviewer_email) ?? 0) + 1);
    expect(Math.max(...load.values())).toBeLessThanOrEqual(2);
  });

  it("never assigns an applicant to themselves", () => {
    const selfy = [{ id: "s1", email: "r1@x.edu" }];
    const plan = planAssignments(selfy, reviewers, [], 2, seeded(5));
    expect(plan.every((p) => p.reviewer_email !== "r1@x.edu")).toBe(true);
  });
});

describe("reviews already submitted are preserved", () => {
  it("tops up around a preserved pair instead of re-dealing it", () => {
    // The reshuffle passes preserved (review-backed) pairs as `existing`, so an
    // applicant with one submitted review gets ONE more reviewer, not two.
    const preserved = [{ applicant_id: "a1", reviewer_email: "r1@x.edu" }];
    const plan = planAssignments([applicants[0]], reviewers, preserved, 2, seeded(13));
    expect(plan).toHaveLength(1);
    expect(plan[0].reviewer_email).not.toBe("r1@x.edu");
  });

  it("leaves an applicant alone when preserved pairs already meet k", () => {
    const preserved = [
      { applicant_id: "a1", reviewer_email: "r1@x.edu" },
      { applicant_id: "a1", reviewer_email: "r2@x.edu" },
    ];
    expect(planAssignments([applicants[0]], reviewers, preserved, 2, seeded(17))).toEqual([]);
  });
});
