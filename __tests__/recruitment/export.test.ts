/**
 * The cycle as a spreadsheet.
 *
 * Exec exports this to write decision emails, so the file leaves the portal and
 * gets forwarded. Two things therefore matter more than they would for an
 * on-screen table: it must be encoded so a spreadsheet reads it back exactly as
 * written, and it must not carry anything that shouldn't circulate.
 */

import {
  EXPORT_HEADERS,
  csvCell,
  exportFilename,
  toCsv,
  toExportRow,
} from "@/features/03-recruitment-ats/lib/export";
import type { Applicant, Flag, Review } from "@/features/03-recruitment-ats/lib/types";

function applicant(over: Partial<Applicant> = {}): Applicant {
  return {
    id: "a1",
    created_at: "2026-08-20T12:00:00Z",
    name: "Jane Doe",
    email: "jane@illinois.edu",
    year: "Sophomore",
    major: "Industrial Engineering",
    college: "Grainger",
    responses: { why: "secret essay text" },
    stage: "rejected",
    cycle: "fa26",
    ...over,
  };
}

function review(total: Partial<Record<string, number>>, notes = ""): Review {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: "2026-08-25T00:00:00Z",
    applicant_id: "a1",
    reviewer_email: "sam@illinois.edu",
    scores: total as Review["scores"],
    weighted_total: 0,
    notes,
    kind: "screen",
  };
}

const FULL = { essay_1: 5, essay_2: 3, essay_3: 3, case_essay: 7, misc: 5, resume: 5 }; // 28
const WEAK = { essay_1: 2, essay_2: 1, essay_3: 1, case_essay: 2, misc: 2, resume: 3 }; // 11

describe("csvCell", () => {
  it("quotes fields containing a delimiter, quote or newline", () => {
    expect(csvCell("Doe, Jane")).toBe('"Doe, Jane"');
    expect(csvCell('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("quotes edge whitespace a reader would otherwise strip", () => {
    expect(csvCell(" leading")).toBe('" leading"');
    expect(csvCell("trailing ")).toBe('"trailing "');
  });

  it("leaves ordinary values alone", () => {
    expect(csvCell("Jane Doe")).toBe("Jane Doe");
    expect(csvCell(28)).toBe("28");
  });

  it("renders null and undefined as empty, not as the words", () => {
    // "null" in a mail-merge greeting is the classic version of this bug.
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("defuses spreadsheet formula injection", () => {
    // Every text column is applicant-controlled — they type their own name and
    // major — and Excel executes a cell starting with =, +, - or @. This file is
    // opened and forwarded by exec, so a live formula in it is a real path in.
    expect(csvCell('=HYPERLINK("http://evil","click")')).toBe(
      `"'=HYPERLINK(""http://evil"",""click"")"`
    );
    expect(csvCell("+1234")).toBe("'+1234");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@user")).toBe("'@user");
    // A normal name is untouched.
    expect(csvCell("Jane Doe")).toBe("Jane Doe");
  });
});

describe("toCsv", () => {
  const csv = toCsv(["A", "B"], [["1", "2"], ["x,y", "z"]]);

  it("uses CRLF line endings, as RFC 4180 and Excel expect", () => {
    expect(csv).toContain("\r\n");
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("leads with a BOM so Excel reads it as UTF-8", () => {
    // Without this, an accented name arrives mangled.
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("puts the header first and escapes the body", () => {
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("A,B");
    expect(lines[2]).toBe('"x,y",z');
  });
});

describe("toExportRow", () => {
  const flags: Flag[] = [
    { id: "f1", created_at: "", applicant_id: "a1", subject_email: "jane@illinois.edu", submitter_email: "s@x.edu", color: "green", description: "great" },
    { id: "f2", created_at: "", applicant_id: "a1", subject_email: "jane@illinois.edu", submitter_email: "t@x.edu", color: "red", description: "concern" },
    { id: "f3", created_at: "", applicant_id: "other", subject_email: "bob@illinois.edu", submitter_email: "s@x.edu", color: "red", description: "not hers" },
  ];

  it("carries what a decision email needs", () => {
    const row = toExportRow(applicant(), [review(FULL), review(WEAK)], flags, 28);
    const byHeader = Object.fromEntries(EXPORT_HEADERS.map((h, i) => [h, row[i]]));

    expect(byHeader["Name"]).toBe("Jane Doe");
    expect(byHeader["Email"]).toBe("jane@illinois.edu");
    expect(byHeader["Stage"]).toBe("rejected");
    expect(byHeader["Cycle"]).toBe("Fall 2026");
    expect(byHeader["Reviews"]).toBe(2);
    expect(byHeader["Mean score"]).toBe(19.5); // (28 + 11) / 2
    expect(byHeader["Max score"]).toBe(28);
    expect(byHeader["Spread"]).toBe(17);
  });

  it("counts only that candidate's own flags", () => {
    const row = toExportRow(applicant(), [], flags, 28);
    const byHeader = Object.fromEntries(EXPORT_HEADERS.map((h, i) => [h, row[i]]));
    expect(byHeader["Green flags"]).toBe(1);
    expect(byHeader["Red flags"]).toBe(1); // f3 belongs to somebody else
  });

  it("leaves score columns blank rather than zero when nobody has read them", () => {
    // A 0 mean would read as "scored badly" in a spreadsheet someone sorts on.
    const row = toExportRow(applicant(), [], [], 28);
    const byHeader = Object.fromEntries(EXPORT_HEADERS.map((h, i) => [h, row[i]]));
    expect(byHeader["Reviews"]).toBe(0);
    expect(byHeader["Mean score"]).toBe("");
    expect(byHeader["Spread"]).toBe("");
  });

  it("never exports essay answers or reviewer notes", () => {
    // This file circulates. Notes are one reviewer's candid writing about a
    // person, and essays are the applicant's; neither belongs in a document that
    // gets forwarded. Exec reads both in the portal, which does not leave it.
    const row = toExportRow(
      applicant(),
      [review(FULL, "Rambling and unfocused, would not recommend.")],
      [],
      28
    );
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain("Rambling");
    expect(serialized).not.toContain("secret essay text");
  });

  it("excludes interview rubrics from the written mean", () => {
    const interview = { ...review(FULL), kind: "case" as const };
    const row = toExportRow(applicant(), [review(WEAK), interview], [], 28);
    const byHeader = Object.fromEntries(EXPORT_HEADERS.map((h, i) => [h, row[i]]));
    expect(byHeader["Reviews"]).toBe(1);
    expect(byHeader["Mean score"]).toBe(11);
  });
});

describe("exportFilename", () => {
  const day = new Date("2026-08-30T12:00:00Z");

  it("names the cycle, the filter and the date", () => {
    // These pile up in a downloads folder; "export.csv" tells you nothing later.
    expect(exportFilename("fa26", "rejected", day)).toBe("cube-applicants-fa26-rejected-2026-08-30.csv");
  });

  it("omits the scope when exporting everyone", () => {
    expect(exportFilename("fa26", null, day)).toBe("cube-applicants-fa26-2026-08-30.csv");
    expect(exportFilename("fa26", "all", day)).toBe("cube-applicants-fa26-2026-08-30.csv");
  });
});
