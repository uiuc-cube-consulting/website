/**
 * Who applied, and whether the process treats them the same.
 *
 * The form asks for PRONOUNS, not gender, and this reports what was collected
 * rather than inferring a category nobody was asked for. The bucketing has to
 * survive how people actually write the answer, and the stage split has to stay
 * comparable across groups of very different sizes — that second one is the
 * whole point, since a headline percentage cannot show a process skewing.
 */

import {
  breakdownBy,
  demographicsReport,
  normalizeMajor,
  pronounGroup,
  PRONOUN_FIELD,
} from "@/features/03-recruitment-ats/lib/demographics";
import type { Applicant, Review } from "@/features/03-recruitment-ats/lib/types";

const STAGE_ORDER = ["applied", "screened", "interview", "offer", "accepted", "rejected", "withdrawn"];

function applicant(id: string, pronouns: string | undefined, stage = "applied"): Applicant {
  return {
    id,
    created_at: "2026-08-20",
    name: `Person ${id}`,
    email: `${id}@illinois.edu`,
    responses: pronouns === undefined ? {} : { [PRONOUN_FIELD]: pronouns },
    stage: stage as Applicant["stage"],
    cycle: "fa26",
  };
}

function review(applicant_id: string, total: number): Review {
  // screenTotal sums the criteria, so build a payload that adds to `total`.
  return {
    id: Math.random().toString(36).slice(2),
    created_at: "2026-08-25",
    applicant_id,
    reviewer_email: "r@illinois.edu",
    scores: { essay_1: 0, essay_2: 0, essay_3: 0, case_essay: 0, misc: 0, resume: 0, ...spread(total) } as Review["scores"],
    weighted_total: 0,
    kind: "screen",
  };
}
/** Distribute `total` across criteria without exceeding any ceiling. */
function spread(total: number): Record<string, number> {
  const caps: [string, number][] = [["essay_1", 5], ["essay_2", 3], ["essay_3", 3], ["case_essay", 7], ["misc", 5], ["resume", 5]];
  const out: Record<string, number> = {};
  let left = total;
  for (const [k, cap] of caps) { const v = Math.min(cap, left); out[k] = v; left -= v; }
  return out;
}

describe("pronounGroup", () => {
  it("buckets the spellings people actually write", () => {
    for (const v of ["she/her", "She/Her", "she/her/hers", "  SHE / HER  ", "she"]) {
      expect(pronounGroup(v)).toBe("she");
    }
    for (const v of ["he/him", "He/Him/His", "he / him"]) expect(pronounGroup(v)).toBe("he");
    expect(pronounGroup("they/them")).toBe("they");
  });

  it("takes the pronoun listed first when someone gives two", () => {
    // "she/they" means she first. The alternative is a bucket per combination,
    // which nobody can read.
    expect(pronounGroup("she/they")).toBe("she");
    expect(pronounGroup("he/they")).toBe("he");
  });

  it("does not match a pronoun inside another word", () => {
    // "Theodore" contains "he"; word boundaries are why this is a regex and not
    // an includes().
    expect(pronounGroup("Theodore")).toBe("other");
    expect(pronounGroup("shepherd")).toBe("other");
  });

  it("separates an unrecognised answer from no answer at all", () => {
    // Different facts. Collapsing them hides that somebody answered.
    expect(pronounGroup("prefer not to say")).toBe("other");
    expect(pronounGroup("")).toBe("unstated");
    expect(pronounGroup("   ")).toBe("unstated");
    expect(pronounGroup(undefined)).toBe("unstated");
  });
});

describe("demographicsReport", () => {
  const applicants = [
    applicant("a1", "she/her", "interview"),
    applicant("a2", "she/her", "rejected"),
    applicant("a3", "he/him", "interview"),
    applicant("a4", "he/him", "interview"),
    applicant("a5", "he/him", "rejected"),
    applicant("a6", "they/them", "applied"),
  ];

  it("counts each group and its share of the cohort", () => {
    const r = demographicsReport(applicants, [], STAGE_ORDER);
    expect(r.total).toBe(6);
    const by = Object.fromEntries(r.groups.map((g) => [g.group, g]));
    expect(by.she.count).toBe(2);
    expect(by.he.count).toBe(3);
    expect(by.they.count).toBe(1);
    expect(by.he.pct).toBe(50);
  });

  it("splits each group across stages — the part a headline number hides", () => {
    const r = demographicsReport(applicants, [], STAGE_ORDER);
    const by = Object.fromEntries(r.groups.map((g) => [g.group, g]));
    expect(by.she.byStage.interview).toBe(1);
    expect(by.she.byStage.rejected).toBe(1);
    expect(by.he.byStage.interview).toBe(2);
    expect(by.he.byStage.rejected).toBe(1);
  });

  it("lists only stages the cohort actually occupies, in pipeline order", () => {
    const r = demographicsReport(applicants, [], STAGE_ORDER);
    expect(r.stages).toEqual(["applied", "interview", "rejected"]);
  });

  it("omits groups nobody is in, rather than showing empty rows", () => {
    const r = demographicsReport([applicant("x", "he/him")], [], STAGE_ORDER);
    expect(r.groups.map((g) => g.group)).toEqual(["he"]);
  });

  it("averages the score per PERSON, not per review", () => {
    // a1 is read three times, a2 once. Averaging over reviews would let a1's
    // extra reviewer quietly pull the group mean toward them.
    const reviews = [review("a1", 12), review("a1", 12), review("a1", 12), review("a2", 24)];
    const r = demographicsReport(applicants, reviews, STAGE_ORDER);
    const she = r.groups.find((g) => g.group === "she")!;
    expect(she.reviewed).toBe(2);
    expect(she.meanScore).toBe(18); // (12 + 24) / 2, not (12+12+12+24)/4
  });

  it("reports no mean for a group nobody has read", () => {
    const r = demographicsReport(applicants, [], STAGE_ORDER);
    expect(r.groups.every((g) => g.meanScore === null && g.reviewed === 0)).toBe(true);
  });

  it("ignores interview rubrics in the written mean", () => {
    const interview = { ...review("a1", 20), kind: "case" as const };
    const r = demographicsReport(applicants, [review("a1", 10), interview], STAGE_ORDER);
    const she = r.groups.find((g) => g.group === "she")!;
    expect(she.reviewed).toBe(1);
    expect(she.meanScore).toBe(10);
  });

  it("handles an empty cohort without dividing by zero", () => {
    const r = demographicsReport([], [], STAGE_ORDER);
    expect(r).toEqual({ dimension: "pronouns", total: 0, groups: [], stages: [], distinct: 0 });
  });
});

describe("normalizeMajor", () => {
  it("collapses the ways one major gets written", () => {
    // The live cycle has "Finance + Data Science" (25), "Finance + DS" (5) and
    // "Finance and Data Science" (4) — 34 people reported as three majors, with
    // the largest appearing as 25.
    const key = normalizeMajor("Finance + Data Science");
    expect(normalizeMajor("Finance + DS")).toBe(key);
    expect(normalizeMajor("Finance and Data Science")).toBe(key);
    expect(normalizeMajor("finance & data science")).toBe(key);
    expect(normalizeMajor("  Finance  +  Data   Science ")).toBe(key);
  });

  it("is order-independent for a double major", () => {
    expect(normalizeMajor("CS + Econ")).toBe(normalizeMajor("Economics + Computer Science"));
  });

  it("expands abbreviations only as whole tokens", () => {
    // Substring expansion would turn "Design" into "Data ScienceIGN".
    expect(normalizeMajor("Systems Engineering & Design")).toContain("design");
    expect(normalizeMajor("Design")).toBe("design");
    expect(normalizeMajor("DS")).toBe("data science");
  });

  it("dedupes a repeated component", () => {
    expect(normalizeMajor("Economics and Economics")).toBe("economics");
  });

  it("treats a blank as no answer", () => {
    expect(normalizeMajor("")).toBe("");
    expect(normalizeMajor(null)).toBe("");
    expect(normalizeMajor("   ")).toBe("");
  });
});

describe("breakdownBy — high-cardinality dimensions", () => {
  const many = (n: number, major: string, stage = "applied") =>
    Array.from({ length: n }, (_, i) => {
      const a = applicant(`${major}-${i}`, "he/him", stage);
      return { ...a, major };
    });

  it("merges spellings of the same major into one group", () => {
    const applicants = [
      ...many(3, "Finance + Data Science"),
      ...many(2, "Finance + DS"),
      ...many(1, "Finance and Data Science"),
    ];
    const r = breakdownBy("major", applicants, [], STAGE_ORDER);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].count).toBe(6);
    expect(r.distinct).toBe(1);
  });

  it("keeps the largest groups and collapses the tail into Other", () => {
    // 99 of 146 majors appear exactly once. Drawing all of them is a list, not
    // a chart.
    const applicants = [
      ...many(10, "Computer Science"),
      ...many(5, "Economics"),
      ...Array.from({ length: 8 }, (_, i) => ({ ...applicant(`solo-${i}`, "he/him"), major: `Major ${i}` })),
    ];
    const r = breakdownBy("major", applicants, [], STAGE_ORDER, 2);
    expect(r.groups.map((g) => g.count)).toEqual([10, 5, 8]);
    expect(r.groups[2].group).toBe("__other__");
    expect(r.groups[2].label).toContain("8 more");
    // The true variety is still reported, even though only 2 rows are drawn.
    expect(r.distinct).toBe(10);
  });

  it("never truncates pronouns", () => {
    const applicants = [
      applicant("a", "she/her"), applicant("b", "he/him"),
      applicant("c", "they/them"), applicant("d", "xe/xem"), applicant("e", undefined),
    ];
    const r = breakdownBy("pronouns", applicants, [], STAGE_ORDER, 2);
    expect(r.groups).toHaveLength(5);
    expect(r.groups.some((g) => g.group === "__other__")).toBe(false);
  });

  it("orders groups largest first", () => {
    const applicants = [...many(2, "Economics"), ...many(5, "Computer Science")];
    const r = breakdownBy("major", applicants, [], STAGE_ORDER);
    expect(r.groups[0].label).toBe("Computer Science");
  });

  it("buckets a missing major as Not stated rather than dropping the person", () => {
    const applicants = [{ ...applicant("a", "he/him"), major: undefined }];
    const r = breakdownBy("major", applicants, [], STAGE_ORDER);
    expect(r.total).toBe(1);
    expect(r.groups[0].label).toBe("Not stated");
  });

  it("merges known college synonyms", () => {
    const applicants = [
      { ...applicant("a", "he/him"), college: "iSchool" },
      { ...applicant("b", "he/him"), college: "School of Information Sciences" },
    ];
    const r = breakdownBy("college", applicants, [], STAGE_ORDER);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].count).toBe(2);
  });
});
