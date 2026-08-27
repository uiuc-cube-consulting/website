/**
 * Narrowing the reviewer pool before a random assignment run.
 *
 * Exec ticks who is actually reviewing this cycle. The rule has to hold in one
 * place because two consumers depend on it: the picker warns with it, and the
 * route refuses with it.
 */

import {
  MIN_REVIEWERS_PER_APPLICANT,
  resolveReviewerPool,
} from "@/features/03-recruitment-ats/lib/assignment";

const POOL = [
  "exec@illinois.edu",
  "pm@illinois.edu",
  "sc@illinois.edu",
  "rm@illinois.edu",
];
const k = MIN_REVIEWERS_PER_APPLICANT;

describe("no narrowing", () => {
  it("uses the whole pool when nothing is selected", () => {
    expect(resolveReviewerPool(POOL, null, k).emails).toEqual(POOL);
    expect(resolveReviewerPool(POOL, undefined, k).emails).toEqual(POOL);
  });

  it("treats an empty selection as 'not narrowed', not 'nobody'", () => {
    // The client omits the field entirely when unnarrowed; an empty array
    // arriving anyway must not wipe out the run.
    const r = resolveReviewerPool(POOL, [], k);
    expect(r.emails).toEqual(POOL);
    expect(r.error).toBeUndefined();
  });
});

describe("narrowing", () => {
  it("keeps only the selected reviewers", () => {
    const r = resolveReviewerPool(POOL, ["pm@illinois.edu", "sc@illinois.edu"], k);
    expect(r.emails).toEqual(["pm@illinois.edu", "sc@illinois.edu"]);
    expect(r.error).toBeUndefined();
  });

  it("is case-insensitive and returns the pool's canonical casing", () => {
    const r = resolveReviewerPool(POOL, ["PM@Illinois.edu", "  sc@illinois.edu  "], k);
    expect(r.emails).toEqual(["pm@illinois.edu", "sc@illinois.edu"]);
  });

  it("de-duplicates a repeated selection", () => {
    // Otherwise one person counts twice toward the k-reviewer floor and the run
    // looks adequately staffed when it isn't.
    const r = resolveReviewerPool(POOL, ["pm@illinois.edu", "PM@illinois.edu"], k);
    expect(r.emails).toEqual(["pm@illinois.edu"]);
    expect(r.error).toMatch(/Only 1 reviewer selected/);
  });
});

describe("rejecting anyone outside the pool", () => {
  it("drops non-members and reports them", () => {
    // A stray email would become a live assignment row for someone who cannot
    // sign in — a review that never arrives.
    const r = resolveReviewerPool(POOL, ["pm@illinois.edu", "sc@illinois.edu", "stranger@evil.com"], k);
    expect(r.emails).toEqual(["pm@illinois.edu", "sc@illinois.edu"]);
    expect(r.ignored).toEqual(["stranger@evil.com"]);
    expect(r.error).toBeUndefined();
  });

  it("errors when nothing selected is eligible", () => {
    const r = resolveReviewerPool(POOL, ["nobody@evil.com"], k);
    expect(r.emails).toEqual([]);
    expect(r.ignored).toEqual(["nobody@evil.com"]);
    expect(r.error).toMatch(/None of the selected people/);
  });
});

describe("the two-independent-reads floor", () => {
  it("refuses a selection smaller than k", () => {
    const r = resolveReviewerPool(POOL, ["pm@illinois.edu"], k);
    expect(r.error).toMatch(/each application needs 2 independent reads/);
  });

  it("accepts exactly k", () => {
    expect(resolveReviewerPool(POOL, ["pm@illinois.edu", "sc@illinois.edu"], k).error).toBeUndefined();
  });

  it("counts only ELIGIBLE selections toward the floor", () => {
    // Two ticked, but one is a stranger — that is one real reviewer, not two.
    const r = resolveReviewerPool(POOL, ["pm@illinois.edu", "stranger@evil.com"], k);
    expect(r.emails).toHaveLength(1);
    expect(r.error).toMatch(/Only 1 reviewer selected/);
  });

  it("scales the floor with a larger k", () => {
    const three = ["exec@illinois.edu", "pm@illinois.edu", "sc@illinois.edu"];
    expect(resolveReviewerPool(POOL, three, 3).error).toBeUndefined();
    expect(resolveReviewerPool(POOL, three, 4).error).toMatch(/needs 4 independent reads/);
  });
});
