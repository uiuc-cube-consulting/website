/**
 * Column mapping against the REAL Fall 2026 application form.
 *
 * These headers are copied verbatim from the live response sheet
 * ("CUBE Consulting Application Fall 2026 (Responses)", tab "Form Responses 1").
 * Pinning them means that if someone edits the Form and reorders or renames a
 * question, this fails at `npm test` rather than silently provisioning 200
 * folders named after half a person.
 *
 * The trap this exists to catch: the form has no single "Name" question. It has
 * "First Name" and "Last Name", and a naive search for a header containing
 * "name" matches "First Name" — producing "Mann — email" instead of
 * "Mann Talati — email" on every folder.
 */

import { mapColumns, rowsFromValues } from "@/features/03-recruitment-ats/lib/import";
import { parseResumeId } from "@/features/03-recruitment-ats/lib/form-resume";
import { candidateFolderName } from "@/features/03-recruitment-ats/lib/folder-naming";

const FALL_2026_HEADERS = [
  "Timestamp",
  "Email Address",
  "First Name",
  "Last Name",
  "Pronouns",
  "NetID",
  "College",
  "Year in School",
  "Major",
  "Minor (if applicable)",
  "GPA (Put your high school GPA if you are a freshman)",
  "Phone Number",
  "Expected Graduation Semester and Year",
  "Do you plan to be on campus this semester?",
  "Have you applied to CUBE Consulting previously? If so, which semester(s)?",
  "List all the extracurricular activities you plan on being involved in during the upcoming academic semester. Please include the estimated time commitment for each activity per week.",
  "Have you attended / or are you planning to attend any of our recruitment events?",
  "Are you willing to commit at least 8 hours a week to general meetings and weekly project work? (General meetings are weekly and mandatory)",
  "How did you hear about CUBE Consulting?",
  "Please upload your resume as .pdf ",
  "Why do you want to join CUBE and what do you hope to gain from this experience?",
  "Describe a time when you disagreed with a team leader or authority figure. What did you do to resolve the conflict and how did it impact you or your team.",
  "Describe an influential moment, not listed on your resume, that motivated you to pursue the intersection of Business and Engineering.",
  "What factors should Harborline Outdoor Co. consider when deciding whether or not to acquire Summit & Sole, and describe the process Harborline should use to make this decision?",
];

describe("Fall 2026 form column mapping", () => {
  const cols = mapColumns(FALL_2026_HEADERS);

  it("finds the split name columns, not a single 'Name'", () => {
    expect(cols.first).toBe(2); // First Name
    expect(cols.last).toBe(3); // Last Name
    // There is no standalone name column, and "NetID" must not be mistaken for one.
    expect(cols.name).toBe(-1);
  });

  it("maps the identity and academic columns", () => {
    expect(cols.email).toBe(1); // Email Address
    expect(cols.college).toBe(6); // College — not "Year in School", which also contains "school"
    expect(cols.year).toBe(7); // Year in School — not "Expected Graduation ... and Year"
    expect(cols.major).toBe(8); // Major — not "Minor (if applicable)"
  });

  it("picks the resume UPLOAD question, not the essay that mentions a resume", () => {
    // Header 22 also contains the word "resume" ("not listed on your resume").
    expect(cols.resume).toBe(19);
    expect(FALL_2026_HEADERS[cols.resume]).toContain("upload your resume");
  });

  it("does not duplicate a mapped column into free-form responses", () => {
    for (const i of [1, 2, 3, 6, 7, 8, 19]) expect(cols.core.has(i)).toBe(true);
    // Everything else is preserved as a response.
    expect(cols.core.has(5)).toBe(false); // NetID
    expect(cols.core.has(23)).toBe(false); // the case question
  });
});

describe("end to end from a sheet row", () => {
  // Shaped exactly like the live sheet: Google Forms writes `open?id=` links.
  const FILE_ID = "1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv";
  const row = [
    "8/21/2026 10:04:11",
    "jdoe2@illinois.edu",
    "Jane",
    "Doe",
    "she/her",
    "jdoe2",
    "Grainger College of Engineering",
    "Junior",
    "Industrial Engineering",
    "",
    "3.8",
    "555-0100",
    "May 2028",
    "Yes",
    "No",
    "Marching Illini, 5 hrs/week",
    "Yes",
    "Yes",
    "Friend",
    `https://drive.google.com/open?id=${FILE_ID}`,
    "Because…",
    "Once, a PM…",
    "In high school…",
    "Harborline should…",
  ];

  const { rows } = rowsFromValues([FALL_2026_HEADERS, row]);

  it("joins first and last into a whole name", () => {
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Jane Doe");
  });

  it("carries the resume link through to a Drive file id", () => {
    expect(parseResumeId(rows[0].resumeLink)).toBe(FILE_ID);
  });

  it("produces the folder name a human would expect", () => {
    expect(candidateFolderName(rows[0].name, rows[0].email)).toBe("Jane Doe — jdoe2@illinois.edu");
  });

  it("keeps every unmapped answer instead of dropping it", () => {
    const r = rows[0].responses ?? {};
    expect(r["NetID"]).toBe("jdoe2");
    expect(r["Pronouns"]).toBe("she/her");
    expect(r["GPA (Put your high school GPA if you are a freshman)"]).toBe("3.8");
    // The case answer is the one exec most wants to read later.
    expect(Object.keys(r).some((k) => k.startsWith("What factors should Harborline"))).toBe(true);
    // Mapped columns must not be duplicated here.
    expect(r["First Name"]).toBeUndefined();
    expect(r["Email Address"]).toBeUndefined();
  });

  it("skips a row with no email, since email is the dedupe key", () => {
    const blank = [...row];
    blank[1] = "";
    const out = rowsFromValues([FALL_2026_HEADERS, blank]);
    expect(out.rows).toHaveLength(0);
    // …and says WHICH row, by its 1-based number in the sheet, so a human can go
    // look at it. Silently dropping it is what made "144 in the sheet, 128
    // imported" impossible to explain without reading the spreadsheet by hand.
    expect(out.droppedNoEmail).toEqual([2]);
    expect(out.totalRows).toBe(1);
  });

  it("does not report a trailing blank row as a dropped applicant", () => {
    // Sheets pad with empty rows; reporting those as missing people would bury
    // the real ones in noise.
    const out = rowsFromValues([FALL_2026_HEADERS, row, ["", "", ""], []]);
    expect(out.rows).toHaveLength(1);
    expect(out.droppedNoEmail).toEqual([]);
    expect(out.totalRows).toBe(1);
  });

  it("treats a missing upload as no resume rather than an error", () => {
    const noUpload = [...row];
    noUpload[19] = "";
    const out = rowsFromValues([FALL_2026_HEADERS, noUpload]).rows;
    expect(out[0].resumeLink).toBeUndefined();
    expect(parseResumeId(out[0].resumeLink)).toBeNull();
  });
});

describe("reconciling the sheet against what was imported", () => {
  // The question this exists to answer: "there are 144 rows in the sheet but
  // only 128 applicants". Every number below has to account for itself, or the
  // gap can only be explained by reading the spreadsheet by hand.
  const row = (email: string, first: string) => {
    const r = new Array(FALL_2026_HEADERS.length).fill("");
    r[0] = "2026/08/01 10:00:00";
    r[1] = email;
    r[2] = first;
    r[3] = "Doe";
    return r;
  };

  it("accounts for every non-empty row", () => {
    const out = rowsFromValues([
      FALL_2026_HEADERS,
      row("a@illinois.edu", "A"),
      row("", "B"), // no email → dropped, and named
      row("c@gmail.com", "C"), // any domain is fine — there is no allowlist
      [], // trailing blank → not an applicant, not reported
    ]);

    expect(out.totalRows).toBe(3);
    expect(out.rows).toHaveLength(2);
    expect(out.droppedNoEmail).toEqual([3]);
    // totalRows == imported + dropped, always.
    expect(out.rows.length + out.droppedNoEmail.length).toBe(out.totalRows);
  });

  it("accepts any email domain", () => {
    // Applicants use @illinois.edu, @gmail.com, or anything else; nothing in the
    // import filters on domain, and a regression that added one would show here.
    const out = rowsFromValues([
      FALL_2026_HEADERS,
      row("a@illinois.edu", "A"),
      row("b@gmail.com", "B"),
      row("c@outlook.co.uk", "C"),
    ]);
    expect(out.rows.map((r) => r.email)).toEqual([
      "a@illinois.edu",
      "b@gmail.com",
      "c@outlook.co.uk",
    ]);
  });

  it("keeps a re-submission as a row, leaving the dedupe to the importer", () => {
    // Someone submitting the form twice is the most likely cause of a gap. The
    // parser does NOT drop it — importApplicants does, and reports it under
    // `duplicateInSheet`, so the two stages stay distinguishable.
    const out = rowsFromValues([
      FALL_2026_HEADERS,
      row("dupe@illinois.edu", "First try"),
      row("dupe@illinois.edu", "Second try"),
    ]);
    expect(out.rows).toHaveLength(2);
    expect(out.droppedNoEmail).toEqual([]);
  });
});
