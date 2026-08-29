/**
 * Recruiting cycles — the semester an application belongs to.
 *
 * The property that matters: (person, cycle) identifies an application, so the
 * same person can apply in fa26 and again in sp27 and both survive. Everything
 * here defends the key that makes that work — one canonical spelling per
 * semester, and an ordering that follows the calendar rather than the alphabet.
 */

import {
  compareCycles,
  cycleForDate,
  cycleLabel,
  cycleSortKey,
  cyclesPresent,
  inCycle,
  isCanonicalCycle,
  isCycle,
  nextRecruitingCycle,
  normalizeCycle,
  parseCycle,
  sortCycles,
} from "@/features/03-recruitment-ats/lib/cycle";

describe("normalizeCycle", () => {
  it("accepts the canonical form unchanged", () => {
    expect(normalizeCycle("fa26")).toBe("fa26");
    expect(normalizeCycle("sp27")).toBe("sp27");
    expect(normalizeCycle("su26")).toBe("su26");
  });

  it("collapses every spelling of one semester onto a single key", () => {
    // This is the whole reason normalisation exists: if "Fall 2026", "fa2026"
    // and "FA26" reached the database as written, one cohort would fragment
    // into three and each dashboard would show a third of the applicants.
    for (const spelling of ["FA26", "fa26", "Fall 2026", "fall26", "fa 2026", "fall-26", "Fa.26", "fa/26"]) {
      expect(normalizeCycle(spelling)).toBe("fa26");
    }
  });

  it("rejects anything that isn't a cycle", () => {
    for (const bad of ["", "  ", "26", "fa", "winter26", "fa261", "xx26", null, undefined]) {
      expect(normalizeCycle(bad)).toBeNull();
    }
  });

  it("rejects a single-letter term rather than guessing", () => {
    // "s26" could be spring or summer. Guessing wrong files an application
    // against the wrong cohort, which is invisible until decisions are being
    // made off the wrong pool.
    expect(normalizeCycle("s26")).toBeNull();
    expect(normalizeCycle("f26")).toBeNull();
  });

  it("rejects years the two-digit key cannot round-trip", () => {
    expect(normalizeCycle("fall 1999")).toBeNull();
    expect(normalizeCycle("fall 2100")).toBeNull();
    expect(normalizeCycle("fall 2000")).toBe("fa00");
    expect(normalizeCycle("fall 2099")).toBe("fa99");
  });

  it("round-trips: normalising a canonical key is a no-op", () => {
    for (const c of ["sp00", "su50", "fa99"]) {
      expect(normalizeCycle(normalizeCycle(c))).toBe(c);
      expect(isCanonicalCycle(c)).toBe(true);
    }
    // The loose forms are accepted but are NOT what the CHECK constraint allows.
    expect(isCanonicalCycle("Fall 2026")).toBe(false);
  });
});

describe("parseCycle", () => {
  it("expands two-digit years into the 21st century", () => {
    expect(parseCycle("fa26")).toEqual({ term: "fa", year: 2026 });
    expect(parseCycle("sp07")).toEqual({ term: "sp", year: 2007 });
  });

  it("takes a four-digit year as written", () => {
    expect(parseCycle("Spring 2027")).toEqual({ term: "sp", year: 2027 });
  });
});

describe("isCycle", () => {
  it("is true for every accepted spelling and false otherwise", () => {
    expect(isCycle("Fall 2026")).toBe(true);
    expect(isCycle("nonsense")).toBe(false);
  });
});

describe("ordering", () => {
  it("orders by the calendar, not the alphabet", () => {
    // The trap this exists to avoid: as text, "fa26" < "sp26" — which would put
    // Fall 2026 *before* Spring 2026 — and "fa26" < "sp27" is right only by
    // coincidence. Sorting cycles as strings is always a bug.
    expect(compareCycles("sp26", "fa26")).toBeLessThan(0);
    expect("fa26" < "sp26").toBe(true); // the alphabetical answer, and it is wrong
  });

  it("runs spring → summer → fall within a year, then rolls over", () => {
    const shuffled = ["fa27", "su26", "sp27", "fa26", "sp26"];
    expect([...shuffled].sort(compareCycles)).toEqual(["sp26", "su26", "fa26", "sp27", "fa27"]);
  });

  it("sorts newest first by default and dedupes across spellings", () => {
    expect(sortCycles(["fa26", "Fall 2026", "sp27", "SP27"])).toEqual(["sp27", "fa26"]);
    expect(sortCycles(["fa26", "sp27"], "asc")).toEqual(["fa26", "sp27"]);
  });

  it("sorts unparseable values before every real cycle instead of throwing", () => {
    // One bad row must not break a whole listing.
    expect(cycleSortKey("garbage")).toBe(-1);
    expect(cycleSortKey("sp00")).toBeGreaterThan(-1);
  });

  it("drops unparseable values from a sorted list", () => {
    expect(sortCycles(["fa26", "garbage", null, undefined, ""])).toEqual(["fa26"]);
  });
});

describe("cycleLabel", () => {
  it("renders a human label", () => {
    expect(cycleLabel("fa26")).toBe("Fall 2026");
    expect(cycleLabel("sp27")).toBe("Spring 2027");
    expect(cycleLabel("su26")).toBe("Summer 2026");
  });

  it("returns unparseable input unchanged rather than 'Invalid'", () => {
    expect(cycleLabel("garbage")).toBe("garbage");
    expect(cycleLabel(null)).toBe("");
  });
});

describe("cycleForDate", () => {
  it("splits the year Jan–May spring, Jun–Jul summer, Aug–Dec fall", () => {
    // Must stay in step with the backfill CASE in db/cycles.sql, or a
    // backfilled row and a freshly-written one disagree about the same week.
    expect(cycleForDate(new Date(2026, 0, 15))).toBe("sp26"); // January
    expect(cycleForDate(new Date(2026, 4, 31))).toBe("sp26"); // May
    expect(cycleForDate(new Date(2026, 5, 1))).toBe("su26"); // June
    expect(cycleForDate(new Date(2026, 6, 31))).toBe("su26"); // July
    expect(cycleForDate(new Date(2026, 7, 1))).toBe("fa26"); // August
    expect(cycleForDate(new Date(2026, 11, 31))).toBe("fa26"); // December
  });
});

describe("nextRecruitingCycle", () => {
  it("rolls fall into the following spring", () => {
    expect(nextRecruitingCycle("fa26")).toBe("sp27");
  });

  it("rolls spring and summer into that year's fall", () => {
    expect(nextRecruitingCycle("sp27")).toBe("fa27");
    expect(nextRecruitingCycle("su26")).toBe("fa26");
  });

  it("returns null for a non-cycle", () => {
    expect(nextRecruitingCycle("garbage")).toBeNull();
  });
});

describe("inCycle", () => {
  const rows = [
    { id: "a1", cycle: "fa26" },
    { id: "a2", cycle: "sp27" },
    { id: "a3", cycle: "fa26" },
  ];

  it("narrows to one cohort", () => {
    expect(inCycle(rows, "fa26").map((r) => r.id)).toEqual(["a1", "a3"]);
  });

  it("matches on the canonical form of both sides", () => {
    // A row written before normalisation was enforced still belongs to its cohort.
    expect(inCycle([{ id: "a1", cycle: "Fall 2026" }], "fa26").map((r) => r.id)).toEqual(["a1"]);
    expect(inCycle(rows, "Fall 2026").map((r) => r.id)).toEqual(["a1", "a3"]);
  });

  it("excludes rows with no cycle from every cohort", () => {
    // An un-stamped row belongs to no cohort; counting it in all of them would
    // double-count it in every funnel.
    const mixed = [...rows, { id: "a4", cycle: null }];
    expect(inCycle(mixed, "fa26").map((r) => r.id)).toEqual(["a1", "a3"]);
    expect(inCycle(mixed, "sp27").map((r) => r.id)).toEqual(["a2"]);
  });

  it("passes everything through when no cycle is requested", () => {
    expect(inCycle(rows, null)).toHaveLength(3);
    expect(inCycle(rows, "garbage")).toHaveLength(3);
  });
});

describe("cyclesPresent", () => {
  it("lists the distinct cycles in a cohort, newest first", () => {
    const applicants = [{ cycle: "fa26" }, { cycle: "sp27" }, { cycle: "fa26" }, { cycle: null }];
    expect(cyclesPresent(applicants)).toEqual(["sp27", "fa26"]);
  });
});

describe("the multi-cycle applicant", () => {
  it("keeps two applications from one person apart", () => {
    // The scenario the whole feature exists for: turned down in fa26, applies
    // again in sp27. Two rows, one email, and the cycle is what separates them.
    const applications = [
      { id: "app-1", email: "jane@illinois.edu", cycle: "fa26", stage: "rejected" },
      { id: "app-2", email: "jane@illinois.edu", cycle: "sp27", stage: "applied" },
    ];

    expect(inCycle(applications, "fa26")).toHaveLength(1);
    expect(inCycle(applications, "sp27")).toHaveLength(1);
    expect(inCycle(applications, "sp27")[0].stage).toBe("applied");
    expect(cyclesPresent(applications)).toEqual(["sp27", "fa26"]);
  });
});
