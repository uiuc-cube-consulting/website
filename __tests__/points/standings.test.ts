/**
 * Points standings. The board is built from the ROSTER and the ledger, which is
 * what makes "everyone starts at 0" true without inserting a zero row per
 * member — and what keeps the board in step as people join and leave.
 */

import {
  buildStandings,
  categoryTotals,
  isOnBoard,
  totalFor,
  validateAward,
  withRanks,
  MAX_DELTA,
  type RosterMember,
} from "@/lib/points";

const roster: RosterMember[] = [
  { id: "m1", full_name: "Bryan Zhang", email: "bryanz4@illinois.edu", role: "returning_member" },
  { id: "m2", full_name: "Advit Arora", email: "advita2@illinois.edu", role: "project_manager" },
  { id: "m3", full_name: "Kali Patel", email: "kalip3@illinois.edu", role: "senior_consultant" },
  { id: "e1", full_name: "Mann Talati", email: "mannat2@illinois.edu", role: "exec" },
];

describe("who is on the board", () => {
  it("excludes exec and includes every other role", () => {
    expect(isOnBoard("exec")).toBe(false);
    expect(isOnBoard("project_manager")).toBe(true);
    expect(isOnBoard("senior_consultant")).toBe(true);
    expect(isOnBoard("returning_member")).toBe(true);
    expect(isOnBoard("member")).toBe(true);
  });

  it("keeps exec off the standings entirely", () => {
    const rows = buildStandings(roster, []);
    expect(rows.map((r) => r.name)).not.toContain("Mann Talati");
    expect(rows).toHaveLength(3);
  });
});

describe("officer accounts stay off the board", () => {
  // HR, COO and CEO/Director are shared mailboxes, not people. They exist in
  // `members` so they can sign in, and carry role 'exec' so the single
  // role filter keeps them off the leaderboard.
  const officers: RosterMember[] = [
    { id: "o1", full_name: "HR", email: "hr@cubeconsulting.org", role: "exec" },
    { id: "o2", full_name: "COO", email: "coo@cubeconsulting.org", role: "exec" },
    { id: "o3", full_name: "Director", email: "director@cubeconsulting.org", role: "exec" },
  ];

  it("excludes every shared officer mailbox", () => {
    const rows = buildStandings([...roster, ...officers], []);
    const names = rows.map((r) => r.name);
    expect(names).not.toContain("HR");
    expect(names).not.toContain("COO");
    expect(names).not.toContain("Director");
    expect(rows).toHaveLength(3); // the three real non-exec members only
  });

  it("keeps them off even if they somehow accrued entries", () => {
    // Points awarded to a position would otherwise surface it onto the board.
    const rows = buildStandings([...roster, ...officers], [
      { member_id: "o1", delta: 50 },
      { member_id: "o3", delta: 90 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["Advit Arora", "Bryan Zhang", "Kali Patel"]);
    expect(rows.every((r) => r.points === 0)).toBe(true);
  });
});

describe("everyone starts at zero", () => {
  it("lists every non-exec member with no ledger at all", () => {
    const rows = buildStandings(roster, []);
    expect(rows.every((r) => r.points === 0 && r.entries === 0)).toBe(true);
  });

  it("starts every category at zero too", () => {
    const rows = buildStandings(roster, []);
    expect(rows.every((r) => r.uncategorized === 0)).toBe(true);
    expect(rows[0].categories).toEqual({ fundamentals: 0, professional: 0, social: 0 });
  });

  it("orders an all-zero board alphabetically rather than arbitrarily", () => {
    expect(buildStandings(roster, []).map((r) => r.name)).toEqual([
      "Advit Arora",
      "Bryan Zhang",
      "Kali Patel",
    ]);
  });

  it("gives an all-zero board no leader — everyone ties at rank 1", () => {
    // Numbering 1..34 would invent a standing that does not exist.
    expect(withRanks(buildStandings(roster, [])).every((r) => r.rank === 1)).toBe(true);
  });
});

describe("totals", () => {
  it("sums a member's awards", () => {
    expect(totalFor([{ delta: 5 }, { delta: 3 }, { delta: 2 }])).toBe(10);
  });

  it("nets negative entries against positive ones", () => {
    // Corrections are entries, not edits — a deduction must reduce the total.
    expect(totalFor([{ delta: 10 }, { delta: -4 }])).toBe(6);
  });

  it("counts entries separately from the total", () => {
    const rows = buildStandings(roster, [
      { member_id: "m1", delta: 5 },
      { member_id: "m1", delta: -5 },
    ]);
    const bryan = rows.find((r) => r.name === "Bryan Zhang")!;
    expect(bryan.points).toBe(0);
    expect(bryan.entries).toBe(2); // net zero, but two things happened
  });

  it("ignores ledger rows for someone no longer on the roster", () => {
    // A departed member's entries must not resurrect them onto the board.
    const rows = buildStandings(roster, [{ member_id: "ghost", delta: 99 }]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.points === 0)).toBe(true);
  });

  it("sorts by points descending, then by name", () => {
    const rows = buildStandings(roster, [
      { member_id: "m1", delta: 4 },
      { member_id: "m3", delta: 4 },
      { member_id: "m2", delta: 9 },
    ]);
    expect(rows.map((r) => `${r.name}:${r.points}`)).toEqual([
      "Advit Arora:9",
      "Bryan Zhang:4",
      "Kali Patel:4",
    ]);
  });
});

describe("categories", () => {
  it("breaks each member's total down by category", () => {
    const rows = buildStandings(roster, [
      { member_id: "m1", delta: 2, category: "professional" },
      { member_id: "m1", delta: 1, category: "social" },
      { member_id: "m1", delta: 3, category: "fundamentals" },
      { member_id: "m2", delta: 1, category: "social" },
    ]);
    const bryan = rows.find((r) => r.member_id === "m1")!;
    expect(bryan.categories).toEqual({ fundamentals: 3, professional: 2, social: 1 });
    expect(bryan.points).toBe(6);
    expect(rows.find((r) => r.member_id === "m2")!.categories).toEqual({ fundamentals: 0, professional: 0, social: 1 });
  });

  it("nets a deduction against the category it was made in", () => {
    const { categories } = categoryTotals([
      { delta: 3, category: "social" },
      { delta: -1, category: "social" },
      { delta: 2, category: "professional" },
    ]);
    expect(categories).toEqual({ fundamentals: 0, professional: 2, social: 2 });
  });

  it("keeps entries without a category in the total rather than dropping them", () => {
    // Anything awarded before db/point-categories.sql ran has no category. It
    // still counted then, so the total must not shrink now.
    const bryan = buildStandings(roster, [
      { member_id: "m1", delta: 4 },
      { member_id: "m1", delta: 1, category: null },
      { member_id: "m1", delta: 2, category: "social" },
    ]).find((r) => r.member_id === "m1")!;
    expect(bryan.uncategorized).toBe(5);
    expect(bryan.categories.social).toBe(2);
    expect(bryan.points).toBe(7);
  });

  it("always has categories plus uncategorized adding up to the total", () => {
    const rows = buildStandings(roster, [
      { member_id: "m3", delta: 5, category: "fundamentals" },
      { member_id: "m3", delta: -2, category: "professional" },
      { member_id: "m3", delta: 1 },
    ]);
    for (const r of rows) {
      const sum = r.categories.fundamentals + r.categories.professional + r.categories.social + r.uncategorized;
      expect(sum).toBe(r.points);
    }
  });
});

describe("ranking", () => {
  it("gives tied members the same rank and skips the next (1,2,2,4)", () => {
    const rows = buildStandings(roster, [
      { member_id: "m2", delta: 9 },
      { member_id: "m1", delta: 4 },
      { member_id: "m3", delta: 4 },
    ]);
    expect(withRanks(rows).map((r) => r.rank)).toEqual([1, 2, 2]);
  });

  it("resumes correct numbering after a tie", () => {
    const four: RosterMember[] = [
      ...roster.filter((m) => m.role !== "exec"),
      { id: "m4", full_name: "Zoe Adams", email: "z@illinois.edu", role: "member" },
    ];
    const rows = buildStandings(four, [
      { member_id: "m2", delta: 9 },
      { member_id: "m1", delta: 4 },
      { member_id: "m3", delta: 4 },
      { member_id: "m4", delta: 1 },
    ]);
    expect(withRanks(rows).map((r) => `${r.name}:${r.rank}`)).toEqual([
      "Advit Arora:1",
      "Bryan Zhang:2",
      "Kali Patel:2",
      "Zoe Adams:4",
    ]);
  });
});

describe("award validation", () => {
  it("accepts a normal award in a category", () => {
    expect(validateAward(5, "Attended GM", "fundamentals")).toBeNull();
  });

  it("accepts a deduction", () => {
    expect(validateAward(-3, "Missed deadline", "professional")).toBeNull();
  });

  it("rejects zero, which would be a row that says nothing", () => {
    expect(validateAward(0, "why", "social")).toMatch(/not be zero/);
  });

  it("rejects fractions and non-numbers", () => {
    expect(validateAward(1.5, "x", "social")).toMatch(/whole number/);
    expect(validateAward("5", "x", "social")).toMatch(/whole number/);
  });

  it("bounds the size so a fat-finger can't hand out 100000", () => {
    expect(validateAward(MAX_DELTA + 1, "x", "social")).toMatch(/between/);
    expect(validateAward(-(MAX_DELTA + 1), "x", "social")).toMatch(/between/);
    expect(validateAward(MAX_DELTA, "x", "social")).toBeNull();
  });

  it("requires a real reason, so a total is always explainable", () => {
    expect(validateAward(5, "", "social")).toMatch(/reason is required/);
    expect(validateAward(5, "   ", "social")).toMatch(/reason is required/);
  });

  it("requires one of the three categories", () => {
    expect(validateAward(5, "Coffee chat", undefined)).toMatch(/Pick a category/);
    expect(validateAward(5, "Coffee chat", "leadership")).toMatch(/Pick a category/);
    expect(validateAward(5, "Coffee chat", "Social")).toMatch(/Pick a category/);
  });
});
