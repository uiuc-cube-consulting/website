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
import {
  renderRubricBody,
  rubricDocRequests,
  notesDocRequests,
} from "@/features/03-recruitment-ats/lib/rubric-doc";
import { CASE_RUBRIC, BEHAVIORAL_RUBRIC } from "@/features/03-recruitment-ats/lib/interview";

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

const META = {
  candidateName: "Jane Doe",
  candidateEmail: "jdoe2@illinois.edu",
  subtitle: "Junior · Statistics",
  label: "Case",
};

describe("renderRubricBody", () => {
  it("carries every criterion and its anchor from the code rubric", () => {
    const { text } = renderRubricBody(CASE_RUBRIC, META);
    for (const c of CASE_RUBRIC) {
      expect(text).toContain(c.label);
      expect(text).toContain(c.anchor);
    }
  });

  it("works for the behavioral rubric too", () => {
    const { text } = renderRubricBody(BEHAVIORAL_RUBRIC, { ...META, label: "Behavioral" });
    for (const c of BEHAVIORAL_RUBRIC) expect(text).toContain(c.anchor);
    expect(text).toContain("Behavioral Rubric — Jane Doe");
  });

  it("names the candidate in the heading and identifies them", () => {
    const { text } = renderRubricBody(CASE_RUBRIC, META);
    expect(text).toContain("Case Rubric — Jane Doe");
    expect(text).toContain("jdoe2@illinois.edu");
    expect(text).toContain("Junior · Statistics");
  });

  it("offers all four recommendation values from interview.ts", () => {
    const { text } = renderRubricBody(CASE_RUBRIC, META);
    for (const label of ["Strong yes", "Yes", "No", "Strong no"]) {
      expect(text).toContain(label);
    }
  });

  it("inserts the text exactly once, before any styling request", () => {
    const reqs = rubricDocRequests(CASE_RUBRIC, META);
    const inserts = reqs.filter((r) => "insertText" in r);
    expect(inserts).toHaveLength(1);
    expect(reqs[0]).toHaveProperty("insertText");
  });

  /**
   * The load-bearing invariant: Docs styling ranges are absolute indices into the
   * document. If any range ran past the end of the inserted text, batchUpdate
   * would fail at runtime with an opaque 400 — so assert it here instead.
   */
  it("keeps every styling range inside the inserted text", () => {
    const { text, requests } = renderRubricBody(CASE_RUBRIC, META);
    const end = text.length + 1;
    const ranges = requests
      .flatMap((r) => Object.values(r) as { range?: { startIndex: number; endIndex: number } }[])
      .map((v) => v?.range)
      .filter(Boolean) as { startIndex: number; endIndex: number }[];

    expect(ranges.length).toBeGreaterThan(0);
    for (const r of ranges) {
      expect(r.startIndex).toBeGreaterThanOrEqual(1);
      expect(r.endIndex).toBeLessThanOrEqual(end);
      expect(r.startIndex).toBeLessThan(r.endIndex);
    }
  });

  it("bolds exactly the label, not the write-in blank after it", () => {
    const { text, requests } = renderRubricBody(CASE_RUBRIC, META);
    const bolded = requests
      .filter((r) => (r as { updateTextStyle?: { textStyle?: { bold?: boolean } } }).updateTextStyle?.textStyle?.bold)
      .map((r) => {
        const { range } = (r as { updateTextStyle: { range: { startIndex: number; endIndex: number } } }).updateTextStyle;
        return text.slice(range.startIndex - 1, range.endIndex - 1);
      });
    expect(bolded).toContain("Score (1–5): ");
    expect(bolded).toContain("Interviewer: ");
    for (const b of bolded) expect(b).not.toContain("_");
  });
});

describe("notesDocRequests", () => {
  it("produces a titled but otherwise blank page", () => {
    const reqs = notesDocRequests({ ...META, label: "Notes" });
    const insert = reqs.find((r) => "insertText" in r) as { insertText: { text: string } };
    expect(insert.insertText.text).toContain("Interview Notes — Jane Doe");
    expect(insert.insertText.text.length).toBeLessThan(300);
  });
});
