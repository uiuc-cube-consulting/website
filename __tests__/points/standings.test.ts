/**
 * Points standings. The board is built from the ROSTER and the ledger, which is
 * what makes "everyone starts at 0" true without inserting a zero row per
 * member — and what keeps the board in step as people join and leave.
 */

import {
  buildStandings,
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

describe("everyone starts at zero", () => {
  it("lists every non-exec member with no ledger at all", () => {
    const rows = buildStandings(roster, []);
    expect(rows.every((r) => r.points === 0 && r.entries === 0)).toBe(true);
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
  it("accepts a normal award", () => {
    expect(validateAward(5, "Attended GM")).toBeNull();
  });

  it("accepts a deduction", () => {
    expect(validateAward(-3, "Missed deadline")).toBeNull();
  });

  it("rejects zero, which would be a row that says nothing", () => {
    expect(validateAward(0, "why")).toMatch(/not be zero/);
  });

  it("rejects fractions and non-numbers", () => {
    expect(validateAward(1.5, "x")).toMatch(/whole number/);
    expect(validateAward("5", "x")).toMatch(/whole number/);
  });

  it("bounds the size so a fat-finger can't hand out 100000", () => {
    expect(validateAward(MAX_DELTA + 1, "x")).toMatch(/between/);
    expect(validateAward(-(MAX_DELTA + 1), "x")).toMatch(/between/);
    expect(validateAward(MAX_DELTA, "x")).toBeNull();
  });

  it("requires a real reason, so a total is always explainable", () => {
    expect(validateAward(5, "")).toMatch(/reason is required/);
    expect(validateAward(5, "   ")).toMatch(/reason is required/);
  });
});
