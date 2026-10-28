/**
 * Exec strike overview. Built from the roster so a member with no strikes
 * still counts toward 0, and only approved strikes move anyone up.
 */

import { strikeBreakdown } from "@/lib/strikes";

const roster = [
  { id: "m1", full_name: "Bryan Zhang", email: "bryanz4@illinois.edu", role: "returning_member" },
  { id: "m2", full_name: "Advit Arora", email: "advita2@illinois.edu", role: "project_manager" },
  { id: "m3", full_name: "Kali Patel", email: "kalip3@illinois.edu", role: "senior_consultant" },
  { id: "m4", full_name: null, email: "nn4@illinois.edu", role: "member" },
  { id: "e1", full_name: "Mann Talati", email: "mannat2@illinois.edu", role: "exec" },
];

const approved = (member_id: string, effective_type: "half" | "full" | "voided") => ({
  member_id,
  effective_type,
  status: "approved" as const,
});

function counts(buckets: ReturnType<typeof strikeBreakdown>) {
  return buckets.map((b) => b.members.length);
}

describe("strikeBreakdown", () => {
  it("puts everyone at 0 when there are no strikes, and leaves exec out", () => {
    const buckets = strikeBreakdown(roster, []);
    expect(counts(buckets)).toEqual([4, 0, 0, 0, 0, 0, 0]);
    expect(buckets[0].members.map((m) => m.id)).not.toContain("e1");
  });

  it("gives each half step its own bucket", () => {
    const buckets = strikeBreakdown(roster, [
      approved("m1", "half"),
      approved("m2", "full"),
      approved("m2", "half"),
      approved("m3", "full"),
      approved("m3", "full"),
      approved("m3", "half"),
    ]);
    expect(buckets.map((b) => b.level)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(counts(buckets)).toEqual([1, 1, 0, 1, 0, 1, 0]);
    expect(buckets[1].members[0]).toMatchObject({ id: "m1", total: 0.5 });
    expect(buckets[3].members[0]).toMatchObject({ id: "m2", total: 1.5 });
    expect(buckets[5].members[0]).toMatchObject({ id: "m3", total: 2.5 });
  });

  it("groups 3 and above together", () => {
    const four = Array.from({ length: 4 }, () => approved("m3", "full"));
    const buckets = strikeBreakdown(roster, [...four, approved("m1", "full"), approved("m1", "full")]);
    expect(counts(buckets)).toEqual([2, 0, 0, 0, 1, 0, 1]);
    expect(buckets[6].members[0]).toMatchObject({ id: "m3", total: 4 });
  });

  it("ignores pending, denied, and voided strikes", () => {
    const buckets = strikeBreakdown(roster, [
      { member_id: "m1", effective_type: null, status: "pending" },
      { member_id: "m2", effective_type: null, status: "denied" },
      approved("m3", "voided"),
    ]);
    expect(counts(buckets)).toEqual([4, 0, 0, 0, 0, 0, 0]);
  });

  it("falls back to email when a member has no name", () => {
    const buckets = strikeBreakdown(roster, [approved("m4", "full")]);
    expect(buckets[2].members[0].name).toBe("nn4@illinois.edu");
  });
});
