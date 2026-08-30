// Turning the pipeline into a spreadsheet — for decision emails, and for the
// record of a cycle after the portal has moved on to the next one.
//
// Pure: no server imports, no I/O. The route decides WHO may export and WHICH
// rows; this decides what a row looks like and how it is encoded.

import type { Applicant, Flag, Review } from "./types";
import { isScreenReview, screenTotal } from "./types";
import { cycleLabel } from "./cycle";

/**
 * Spreadsheets execute formulas, and a cell beginning `=`, `+`, `-`, `@`, or a
 * lone tab/CR is treated as one by Excel and Google Sheets alike.
 *
 * Every text column here is applicant-controlled — they type their own name and
 * major — so a value like `=HYPERLINK("http://evil","click")` would arrive as a
 * live formula in a file exec opens and forwards. Prefixing with an apostrophe
 * is the standard defence: spreadsheets treat the rest as literal text and hide
 * the apostrophe itself, so the cell still reads correctly to a human.
 *
 * This is not paranoia about our own applicants; it is that a CSV built from
 * third-party input and opened in Excel is a well-known injection path, and the
 * fix costs one character.
 */
function neutralize(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One CSV field: injection-safe, and quoted whenever quoting is required. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = neutralize(String(value));
  // Quote when the field contains a delimiter, a quote, a newline, or edge
  // whitespace that a reader would otherwise strip. Internal quotes are doubled.
  return /[",\n\r]|^\s|\s$/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** Rows -> CSV text. CRLF line endings, which is what RFC 4180 specifies and
 *  what Excel expects; a leading BOM so Excel reads it as UTF-8 rather than
 *  mangling accented names. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

export const EXPORT_HEADERS = [
  "Name",
  "Email",
  "Stage",
  "Cycle",
  "Year",
  "Major",
  "College",
  "Reviews",
  "Mean score",
  "Max score",
  "Spread",
  "Green flags",
  "Red flags",
  "Applied at",
] as const;

/**
 * One spreadsheet row per applicant.
 *
 * Deliberately NOT included: essay answers and reviewers' written notes. This
 * file exists to send decision emails and to keep a record, and it gets
 * forwarded and shared — notes are one reviewer's candid writing about a person
 * and do not belong in a document that circulates. Aggregate scores do: they are
 * what the decision was actually made on. Anyone who needs the notes has the
 * decision queue, which is exec-only and does not leave the portal.
 */
export function toExportRow(
  applicant: Applicant,
  reviews: Review[],
  flags: Flag[],
  maxPoints: number
): unknown[] {
  const mine = reviews.filter((r) => r.applicant_id === applicant.id && isScreenReview(r));
  // Recomputed from `scores` rather than read from `weighted_total`, for the
  // same reason the decision queue recomputes: a rubric change leaves the stored
  // column meaning something that no longer matches the criteria.
  const totals = mine.map((r) => screenTotal(r.scores));
  const mean = totals.length
    ? Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100
    : null;
  const spread = totals.length > 1 ? Math.max(...totals) - Math.min(...totals) : null;
  const own = flags.filter((f) => f.applicant_id === applicant.id);

  return [
    applicant.name,
    applicant.email,
    applicant.stage,
    cycleLabel(applicant.cycle),
    applicant.year ?? "",
    applicant.major ?? "",
    applicant.college ?? "",
    mine.length,
    mean ?? "",
    maxPoints,
    spread ?? "",
    own.filter((f) => f.color === "green").length,
    own.filter((f) => f.color === "red").length,
    applicant.created_at,
  ];
}

/** `cube-applicants-fa26-rejected-2026-08-30.csv` — cycle and filter in the
 *  name, because these files pile up in a downloads folder and "export.csv"
 *  tells you nothing three weeks later. */
export function exportFilename(cycle: string, stage: string | null, today = new Date()): string {
  const date = today.toISOString().slice(0, 10);
  const scope = stage && stage !== "all" ? `-${stage}` : "";
  return `cube-applicants-${cycle}${scope}-${date}.csv`;
}
