/**
 * The cycle as a spreadsheet.
 *
 * Exec exports this to write decision emails, so the file leaves the portal and
 * gets forwarded. Two things therefore matter more than they would for an
 * on-screen table: it must be encoded so a spreadsheet reads it back exactly as
 * written, and it must not carry anything that shouldn't circulate.
 */

import {
  DECISION_EXPORTS,
  EXPORT_HEADERS,
  csvCell,
  decisionExportQuery,
  exportFilename,
  isCountableFromStage,
  toCsv,
  toExportRow,
} from "@/features/03-recruitment-ats/lib/export";
import { ALL_STAGES } from "@/features/03-recruitment-ats/lib/types";
import type { Applicant, Flag, Review } from "@/features/03-recruitment-ats/lib/types";
import { isRound } from "@/features/03-recruitment-ats/lib/rounds";

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

  it("emits exactly one cell per header", () => {
    // Every other assertion in here reads the row by zipping it against
    // EXPORT_HEADERS, which silently tolerates a row that is the wrong width —
    // a dropped cell shifts every column after it, and the file still opens.
    // This is the only check that would catch that, and the second round losing
    // its behavioral column is exactly the edit that could cause it.
    const row = toExportRow(applicant(), [review(FULL)], flags, 28);
    expect(row).toHaveLength(EXPORT_HEADERS.length);
  });

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

// ── The named decision lists ─────────────────────────────────────────────────
//
// Each of these is a mailing list. The failure that matters is not a missing
// column, it is the wrong PEOPLE: a filter the route silently drops does not
// export nothing, it exports everyone.

describe("DECISION_EXPORTS", () => {
  it("names only real stages and real rounds", () => {
    for (const x of DECISION_EXPORTS) {
      if (x.stage) expect(ALL_STAGES).toContain(x.stage);
      if (x.round) expect(isRound(x.round)).toBe(true);
      // A list that filters on nothing is the whole cycle under a label that
      // says otherwise.
      expect(x.stage || x.round).toBeTruthy();
    }
  });

  it("covers the three groups the final round produces", () => {
    // Offer, waitlist, rejection — the whole point of the waitlist existing is
    // that the middle one is no longer folded into either neighbour.
    const byLabel = Object.fromEntries(DECISION_EXPORTS.map((x) => [x.label, x]));
    expect(byLabel["Offers"]).toMatchObject({ stage: "offer" });
    expect(byLabel["Waitlist"]).toMatchObject({ stage: "waitlisted" });
    expect(byLabel["Rejected after second round"]).toMatchObject({
      round: "final_round",
      stage: "rejected",
    });
  });

  it("separates the two rejection letters by round", () => {
    const rejections = DECISION_EXPORTS.filter((x) => x.stage === "rejected");
    expect(rejections).toHaveLength(2);
    // Both are `rejected`; only the round tells them apart, which is the entire
    // reason these are buttons rather than a stage filter.
    expect(rejections.map((x) => x.round)).toEqual(["first_round", "final_round"]);
  });

  it("has a distinct label and query for each", () => {
    const labels = DECISION_EXPORTS.map((x) => x.label);
    const queries = DECISION_EXPORTS.map(decisionExportQuery);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(queries).size).toBe(queries.length);
  });
});

describe("decisionExportQuery", () => {
  it("builds the query the export route reads", () => {
    expect(decisionExportQuery({ label: "", title: "", stage: "waitlisted" })).toBe(
      "?stage=waitlisted"
    );
    expect(decisionExportQuery({ label: "", title: "", round: "final_round" })).toBe(
      "?round=final_round"
    );
    expect(
      decisionExportQuery({ label: "", title: "", round: "final_round", stage: "rejected" })
    ).toBe("?round=final_round&stage=rejected");
  });

  it("is empty when nothing is filtered, rather than a stray '?'", () => {
    expect(decisionExportQuery({ label: "", title: "" })).toBe("");
  });
});

describe("isCountableFromStage", () => {
  it("counts a list a single stage defines, and refuses one a round narrows", () => {
    expect(isCountableFromStage({ label: "", title: "", stage: "waitlisted" })).toBe(true);
    expect(isCountableFromStage({ label: "", title: "", stage: "offer" })).toBe(true);
    // `rejected` is where both rejection lists sit; the stage count would be the
    // sum of the two and match neither file.
    expect(
      isCountableFromStage({ label: "", title: "", round: "final_round", stage: "rejected" })
    ).toBe(false);
    expect(isCountableFromStage({ label: "", title: "", round: "final_round" })).toBe(false);
  });
});

describe("exportFilename for the new lists", () => {
  const day = new Date("2026-09-11T12:00:00Z");

  it("gives each decision list a file you can still identify next week", () => {
    expect(exportFilename("fa26", "offer", day)).toBe("cube-applicants-fa26-offer-2026-09-11.csv");
    expect(exportFilename("fa26", "waitlisted", day)).toBe(
      "cube-applicants-fa26-waitlisted-2026-09-11.csv"
    );
    // The round comes before the stage, so the two rejection files sort apart
    // in a downloads folder instead of reading as near-identical names.
    expect(exportFilename("fa26", "rejected", day, "final_round")).toBe(
      "cube-applicants-fa26-final_round-rejected-2026-09-11.csv"
    );
    expect(exportFilename("fa26", "rejected", day, "first_round")).toBe(
      "cube-applicants-fa26-first_round-rejected-2026-09-11.csv"
    );
  });

  it("gives every named list a distinct filename", () => {
    const names = DECISION_EXPORTS.map((x) =>
      exportFilename("fa26", x.stage ?? null, day, x.round ?? null)
    );
    expect(new Set(names).size).toBe(names.length);
  });
});
