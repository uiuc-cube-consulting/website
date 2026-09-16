import {
  filterCaseStudies,
  type CaseStudy,
} from "@/features/01-case-study-engine/lib/case-studies";

function study(overrides: Partial<CaseStudy> = {}): CaseStudy {
  return {
    id: "sample",
    name: "Sample",
    anonymized: false,
    practiceAreas: [],
    keywords: [],
    summary: "",
    hasDetails: true,
    semester: "SP26",
    season: "Spring",
    year: 2026,
    termLabel: "Spring 2026",
    termIndex: 4052,
    engagements: 1,
    repeatClient: false,
    ...overrides,
  };
}

describe("filterCaseStudies", () => {
  test("short tokens match word starts, including hyphenated words", () => {
    const ai = study({ id: "ai", summary: "AI-powered tools" });
    const it = study({ id: "it", summary: "IT support" });
    const unrelated = study({ summary: "Maintain detail with digital tools" });
    expect(filterCaseStudies([ai, it, unrelated], { query: "AI" })).toEqual([ai]);
    expect(filterCaseStudies([ai, it, unrelated], { query: "it" })).toEqual([it]);
  });

  test("prefixes match and all query words must occur across searchable fields", () => {
    const match = study({ name: "Example", keywords: ["Marketing"], summary: "Research" });
    const partial = study({ keywords: ["Marketing"] });
    expect(filterCaseStudies([match, partial], { query: " market\tRESEARCH " })).toEqual([match]);
  });

  test.each(["c++", "ui/ux", "node.js", "a[b]", "a(b)", "a*b", "a?b", "a|b", "a^b", "a$b", "a{2}", "a\\b"])(
    "treats special characters in %s literally",
    (query) => {
      const match = study({ keywords: [query] });
      const unrelated = study({ summary: "cccc uiXux nodeXjs ab aab b" });
      expect(filterCaseStudies([match, unrelated], { query })).toEqual([match]);
    }
  );

  test.each(["name", "summary", "termLabel", "practiceAreas", "keywords"] as const)(
    "searches %s",
    (field) => {
      const match = study({ [field]: field === "practiceAreas" || field === "keywords" ? ["Example"] : "Example" });
      expect(filterCaseStudies([match], { query: "exam" })).toEqual([match]);
    }
  );

  test("combines search and term filters with OR-matched practice areas", () => {
    const software = study({ id: "software", summary: "Prototype", practiceAreas: ["Software & Data"] });
    const hardware = study({ id: "hardware", summary: "Prototype", practiceAreas: ["Product & Hardware"] });
    const otherTerm = study({ ...software, termLabel: "Fall 2025" });
    const otherArea = study({ summary: "Prototype", practiceAreas: ["Marketing & Brand"] });
    expect(filterCaseStudies([software, hardware, otherTerm, otherArea], {
      query: "proto",
      areas: ["Software & Data", "Product & Hardware"],
      term: "Spring 2026",
    })).toEqual([software, hardware]);
  });

  test("empty filters preserve all studies without mutating their order", () => {
    const studies = [study({ name: "Zeta" }), study({ name: "Alpha" })];
    expect(filterCaseStudies(studies, { query: "  ", areas: [""], term: "all" })).toEqual([studies[1], studies[0]]);
    expect(studies.map((s) => s.name)).toEqual(["Zeta", "Alpha"]);
    expect(filterCaseStudies([], { query: "ai" })).toEqual([]);
  });

  test("sorts newest and oldest with alphabetical ties, or alphabetically", () => {
    const alpha = study({ name: "Alpha", termIndex: 4051 });
    const beta = study({ name: "Beta", termIndex: 4052 });
    const gamma = study({ name: "Gamma", termIndex: 4052 });
    const studies = [gamma, alpha, beta];
    expect(filterCaseStudies(studies)).toEqual([beta, gamma, alpha]);
    expect(filterCaseStudies(studies, { sort: "newest" })).toEqual([beta, gamma, alpha]);
    expect(filterCaseStudies(studies, { sort: "oldest" })).toEqual([alpha, beta, gamma]);
    expect(filterCaseStudies(studies, { sort: "az" })).toEqual([alpha, beta, gamma]);
  });
});
