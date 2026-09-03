/**
 * Pure-module tests for Drive folder provisioning.
 *
 * These three modules carry the logic that is easy to get quietly wrong — link
 * parsing across Google's inconsistent URL shapes, folder names that must stay
 * stable and collision-free across re-runs, and Docs API index ranges that must
 * line up with the text they style. None of them touch the network.
 */

import {
  parseDriveIds,
  parseResumeId,
  driveFileUrl,
  driveFolderUrl,
} from "@/features/03-recruitment-ats/lib/form-resume";
import {
  candidateFolderName,
  resumeFileName,
  docTitle,
  cycleFolderName,
  sanitize,
} from "@/features/03-recruitment-ats/lib/folder-naming";
import { notesDocRequests } from "@/features/03-recruitment-ats/lib/rubric-doc";
import {
  CASE_RUBRIC,
  BEHAVIORAL_RUBRIC,
  BEHAVIORAL_QUESTIONS,
  isComplete,
  submittedTotal,
  rubricMax,
  panelStanding,
  formatScore,
  recommendationLabel,
} from "@/features/03-recruitment-ats/lib/interview";
import { rubricMaxPoints } from "@/features/03-recruitment-ats/lib/types";

// ── form-resume ──────────────────────────────────────────────────────────────

describe("parseDriveIds", () => {
  const ID = "1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv";

  it("reads the shape Google Forms actually writes", () => {
    expect(parseDriveIds(`https://drive.google.com/open?id=${ID}`)).toEqual([ID]);
  });

  it("reads a pasted share link", () => {
    expect(parseDriveIds(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toEqual([ID]);
  });

  it("reads a direct-download link", () => {
    expect(parseDriveIds(`https://drive.google.com/uc?export=download&id=${ID}`)).toEqual([ID]);
  });

  it("reads a Google Doc link", () => {
    expect(parseDriveIds(`https://docs.google.com/document/d/${ID}/edit`)).toEqual([ID]);
  });

  it("accepts a bare id with no URL around it", () => {
    expect(parseDriveIds(ID)).toEqual([ID]);
  });

  it("splits a multi-file upload cell and preserves order", () => {
    const b = "9Z8y7X6w5V4u3T2s1R0qPoNmLkJiHgFe";
    expect(parseDriveIds(`https://drive.google.com/open?id=${ID}, https://drive.google.com/open?id=${b}`))
      .toEqual([ID, b]);
  });

  it("splits on newlines as well as commas", () => {
    const b = "9Z8y7X6w5V4u3T2s1R0qPoNmLkJiHgFe";
    expect(parseDriveIds(`https://drive.google.com/open?id=${ID}\nhttps://drive.google.com/open?id=${b}`))
      .toEqual([ID, b]);
  });

  it("dedupes a file listed twice", () => {
    expect(parseDriveIds(`https://drive.google.com/open?id=${ID}, https://drive.google.com/file/d/${ID}/view`))
      .toEqual([ID]);
  });

  it("treats an empty or link-less cell as no resume, not an error", () => {
    expect(parseDriveIds("")).toEqual([]);
    expect(parseDriveIds(null)).toEqual([]);
    expect(parseDriveIds(undefined)).toEqual([]);
    expect(parseDriveIds("did not upload")).toEqual([]);
  });

  it("takes the first file when several were uploaded", () => {
    const b = "9Z8y7X6w5V4u3T2s1R0qPoNmLkJiHgFe";
    expect(parseResumeId(`https://drive.google.com/open?id=${ID},https://drive.google.com/open?id=${b}`)).toBe(ID);
    expect(parseResumeId("nothing here")).toBeNull();
  });

  it("builds canonical viewer URLs", () => {
    expect(driveFileUrl(ID)).toBe(`https://drive.google.com/file/d/${ID}/view`);
    expect(driveFolderUrl(ID)).toBe(`https://drive.google.com/drive/folders/${ID}`);
  });
});

// ── folder-naming ────────────────────────────────────────────────────────────

describe("candidateFolderName", () => {
  it("appends the email so two people with one name never collide", () => {
    const a = candidateFolderName("Jane Doe", "jdoe2@illinois.edu");
    const b = candidateFolderName("Jane Doe", "jane.doe@illinois.edu");
    expect(a).toBe("Jane Doe — jdoe2@illinois.edu");
    expect(a).not.toBe(b);
  });

  it("is stable across runs for the same candidate", () => {
    expect(candidateFolderName("Jane Doe", "JDoe2@Illinois.edu"))
      .toBe(candidateFolderName("  Jane   Doe ", "jdoe2@illinois.edu"));
  });

  it("strips characters that break paths", () => {
    expect(candidateFolderName("Jane/Doe:*?", "j@x.com")).toBe("Jane Doe — j@x.com");
    expect(sanitize("a\\b/c:d*e?f\"g<h>i|j")).toBe("a b c d e f g h i j");
  });

  it("never produces an empty folder name", () => {
    expect(candidateFolderName("", "j@x.com")).toBe("j@x.com");
    expect(candidateFolderName("Jane Doe", "")).toBe("Jane Doe");
    expect(candidateFolderName("", "")).toBe("Unnamed candidate");
  });
});

describe("file and doc naming", () => {
  it("preserves the resume's original extension", () => {
    expect(resumeFileName("Jane Doe", "whatever_final_v2.PDF")).toBe("Resume — Jane Doe.pdf");
    expect(resumeFileName("Jane Doe", "cv.docx")).toBe("Resume — Jane Doe.docx");
  });

  it("omits the extension for a Google Doc resume, which has none", () => {
    expect(resumeFileName("Jane Doe", null)).toBe("Resume — Jane Doe");
  });

  it("titles rubric docs consistently", () => {
    expect(docTitle("Case Rubric", "Jane Doe")).toBe("Case Rubric — Jane Doe");
  });

  it("falls back to a named cycle folder", () => {
    expect(cycleFolderName("Fall 2026")).toBe("Fall 2026");
    expect(cycleFolderName("")).toBe("Current cycle");
    expect(cycleFolderName(null)).toBe("Current cycle");
  });
});

// ── rubric-doc ───────────────────────────────────────────────────────────────
// Only the notes page is generated now. The two rubric sheets are copies of the
// club's master files, so there is no body of ours to assert on — what matters
// about them is the copy, covered by the naming tests above.

const META = {
  candidateName: "Jane Doe",
  candidateEmail: "jdoe2@illinois.edu",
  subtitle: "Junior · Statistics",
  label: "Case",
};

describe("notesDocRequests", () => {
  it("produces a titled but otherwise blank page", () => {
    const reqs = notesDocRequests({ ...META, label: "Notes" });
    const insert = reqs.find((r) => "insertText" in r) as { insertText: { text: string } };
    expect(insert.insertText.text).toContain("Interview Notes — Jane Doe");
    expect(insert.insertText.text.length).toBeLessThan(300);
  });
});

// ── FA26 interview rubrics ───────────────────────────────────────────────────
// These lock the numbers the printed sheets promise. The rubrics are a
// transcription of a paper document, and a transcription is exactly the kind of
// thing that drifts silently: a criterion dropped in a refactor still compiles,
// still renders, and simply makes the interview worth fewer points than the sheet
// in the interviewer's hand says it is.

describe("rubric totals match the printed sheets", () => {
  it("scores the case interview out of 15", () => {
    expect(rubricMaxPoints(CASE_RUBRIC)).toBe(15);
    expect(CASE_RUBRIC).toHaveLength(5);
    for (const c of CASE_RUBRIC) expect(c.max).toBe(3);
  });

  it("scores the behavioral interview out of 17, with uneven ceilings", () => {
    expect(rubricMaxPoints(BEHAVIORAL_RUBRIC)).toBe(17);
    expect(BEHAVIORAL_RUBRIC).toHaveLength(6);
    // The two categories the sheet marks "points are increased per box" are the
    // whole reason the ceilings are per-criterion rather than one constant.
    const max = Object.fromEntries(BEHAVIORAL_RUBRIC.map((c) => [c.key, c.max]));
    expect(max).toEqual({
      understanding: 2,
      goals: 4,
      adaptability: 2,
      time_management: 2,
      presentation: 2,
      competence: 5,
    });
  });

  it("keeps the question script aligned with the categories it feeds", () => {
    // Each scored question names a real category; a typo here would silently
    // drop the label the interviewer needs beside the question.
    const keys = new Set(BEHAVIORAL_RUBRIC.map((c) => c.key));
    for (const q of BEHAVIORAL_QUESTIONS) {
      if (q.category) expect(keys).toContain(q.category);
    }
    expect(BEHAVIORAL_QUESTIONS).toHaveLength(9);
  });
});

describe("rubric levels", () => {
  /**
   * Every score a criterion accepts must be described by exactly one column. A gap
   * means an interviewer can pick a number the sheet never explains; an overlap
   * means two columns claim it.
   */
  it("covers 0..max exactly once per criterion", () => {
    for (const rubric of [CASE_RUBRIC, BEHAVIORAL_RUBRIC]) {
      for (const c of rubric) {
        const covered: number[] = [];
        for (const l of c.levels) {
          expect(l.min).toBeLessThanOrEqual(l.max);
          for (let n = l.min; n <= l.max; n++) covered.push(n);
        }
        expect(covered.sort((a, b) => a - b)).toEqual(
          Array.from({ length: c.max + 1 }, (_, n) => n)
        );
      }
    }
  });

  it("gives every level a written descriptor", () => {
    for (const rubric of [CASE_RUBRIC, BEHAVIORAL_RUBRIC]) {
      for (const c of rubric) for (const l of c.levels) expect(l.descriptor.length).toBeGreaterThan(20);
    }
  });
});

describe("isComplete / submittedTotal", () => {
  // What an interviewer submits is the one number off the paper sheet, so
  // completeness is a question about that number and nothing else.

  it("accepts a whole-number total inside the rubric's range", () => {
    expect(isComplete("case", { total: 11 })).toBe(true);
    expect(submittedTotal("case", { total: 11 })).toBe(11);
    expect(isComplete("behavioral", { total: 17 })).toBe(true);
  });

  it("treats zero as a real total, not a blank", () => {
    // Every category unacceptable is a complete review, and a very harsh one.
    expect(isComplete("case", { total: 0 })).toBe(true);
    expect(submittedTotal("case", { total: 0 })).toBe(0);
  });

  it("rejects an unscored rubric rather than coercing it to zero", () => {
    expect(isComplete("case", {})).toBe(false);
    expect(submittedTotal("case", {})).toBeNull();
    expect(submittedTotal("case", null)).toBeNull();
    expect(isComplete("case", { total: null as unknown as number })).toBe(false);
    expect(isComplete("case", { total: "" as unknown as number })).toBe(false);
  });

  it("rejects a total past the rubric's own ceiling", () => {
    // 16 is impossible on the case sheet but ordinary on the behavioral one.
    expect(isComplete("case", { total: 16 })).toBe(false);
    expect(isComplete("behavioral", { total: 16 })).toBe(true);
    expect(isComplete("behavioral", { total: 18 })).toBe(false);
    expect(isComplete("case", { total: -1 })).toBe(false);
  });

  it("accepts a half point, which the behavioral sheet's averaging produces", () => {
    // "Awarded Category Score (the average of both questions)" lands on .5 all
    // the time; forcing a whole number would make the rounding rule the scorer's
    // private choice.
    expect(isComplete("case", { total: 11.5 })).toBe(true);
    expect(submittedTotal("case", { total: 11.5 })).toBe(11.5);
    expect(isComplete("behavioral", { total: 0.5 })).toBe(true);
    expect(isComplete("behavioral", { total: 16.5 })).toBe(true);
  });

  it("rejects a finer slice than a half point", () => {
    expect(isComplete("case", { total: 11.25 })).toBe(false);
    expect(isComplete("case", { total: 0.1 })).toBe(false);
    // Float noise did not come off a rubric, so it is not a score.
    expect(isComplete("case", { total: 2.7000000000000002 })).toBe(false);
  });

  it("still holds the range at the edges with halves in play", () => {
    expect(isComplete("case", { total: 15 })).toBe(true);
    expect(isComplete("case", { total: 15.5 })).toBe(false);
    expect(isComplete("case", { total: -0.5 })).toBe(false);
    expect(isComplete("behavioral", { total: 17 })).toBe(true);
    expect(isComplete("behavioral", { total: 17.5 })).toBe(false);
  });

  it("knows each rubric's maximum", () => {
    expect(rubricMax("case")).toBe(15);
    expect(rubricMax("behavioral")).toBe(17);
    expect(rubricMax("final_case")).toBe(15);
    expect(rubricMax("final_behavioral")).toBe(17);
  });
});

// ── The panel's standing, as the interviews list shows it ────────────────────

describe("panelStanding", () => {
  const KINDS = ["case", "behavioral"] as const;
  const score = (
    kind: "case" | "behavioral",
    total: number,
    reviewer = "a@x.edu",
    recommendation: string | null = null
  ) => ({ reviewer, kind, total, recommendation });

  it("averages within a rubric and adds across the two", () => {
    // Two people scored the case; that is one case score, not a doubled one.
    const st = panelStanding(
      [score("case", 11), score("case", 12, "b@x.edu"), score("behavioral", 14)],
      KINDS
    );
    expect(st.perKind[0].mean).toBe(11.5);
    expect(st.perKind[0].n).toBe(2);
    expect(st.total).toBe(25.5);
    expect(st.max).toBe(32);
    expect(st.submissions).toBe(3);
  });

  it("withholds a total until every rubric has a score", () => {
    // 12/32 for a candidate whose behavioral has not happened reads as a
    // rejection rather than as half-finished work.
    const st = panelStanding([score("case", 12)], KINDS);
    expect(st.perKind[0].mean).toBe(12);
    expect(st.perKind[1].mean).toBeNull();
    expect(st.total).toBeNull();
    expect(st.submissions).toBe(1);
  });

  it("reports nothing scored as nothing, not as zero", () => {
    const st = panelStanding([], KINDS);
    expect(st.submissions).toBe(0);
    expect(st.total).toBeNull();
    expect(st.perKind.every((p) => p.mean === null)).toBe(true);
  });

  it("carries half points through the average", () => {
    const st = panelStanding([score("case", 11.5), score("behavioral", 14.5)], KINDS);
    expect(st.total).toBe(26);
  });

  it("handles an undefined panelScores (a viewer who was sent none)", () => {
    expect(panelStanding(undefined, KINDS).submissions).toBe(0);
  });
});

describe("formatScore", () => {
  it("drops trailing zeros without lying about the value", () => {
    expect(formatScore(14)).toBe("14");
    expect(formatScore(11.5)).toBe("11.5");
    // A mean of three whole numbers is repeating; show it short, not as 11.666666666666666.
    expect(formatScore(35 / 3)).toBe("11.67");
  });
});

describe("recommendations that disagree", () => {
  const KINDS = ["case", "behavioral"] as const;
  const score = (
    kind: "case" | "behavioral",
    total: number,
    reviewer = "a@x.edu",
    recommendation: string | null = null
  ) => ({ reviewer, kind, total, recommendation });

  it("keeps each rubric's own verdict instead of collapsing them", () => {
    // The case went well and the behavioral did not. Both halves have to survive
    // — reporting one verdict for the pair throws away half the interview.
    const st = panelStanding(
      [score("case", 13, "a@x.edu", "yes"), score("behavioral", 6, "a@x.edu", "no")],
      KINDS
    );
    expect(st.perKind[0].recs).toEqual(["yes"]);
    expect(st.perKind[1].recs).toEqual(["no"]);
    expect(st.split).toBe(true);
    expect(st.total).toBe(19);
  });

  it("does not call it split when both rubrics agree", () => {
    const st = panelStanding(
      [score("case", 13, "a@x.edu", "yes"), score("behavioral", 15, "a@x.edu", "yes")],
      KINDS
    );
    expect(st.split).toBe(false);
    expect(st.perKind.every((p) => p.recs.length === 1)).toBe(true);
  });

  it("flags two interviewers disagreeing on the SAME rubric", () => {
    const st = panelStanding(
      [score("case", 13, "a@x.edu", "yes"), score("case", 5, "b@x.edu", "strong_no")],
      KINDS
    );
    // Ordered best-to-worst by RECOMMENDATIONS, not by who submitted first.
    expect(st.perKind[0].recs).toEqual(["yes", "strong_no"]);
    expect(st.split).toBe(true);
  });

  it("is not split when nobody recorded a recommendation", () => {
    const st = panelStanding([score("case", 13), score("behavioral", 15)], KINDS);
    expect(st.split).toBe(false);
    expect(st.perKind.every((p) => p.recs.length === 0)).toBe(true);
  });

  it("labels a recommendation, and an absent one", () => {
    expect(recommendationLabel("strong_yes")).toBe("Strong yes");
    expect(recommendationLabel(null)).toBe("—");
    expect(recommendationLabel("nonsense")).toBe("—");
  });
});
