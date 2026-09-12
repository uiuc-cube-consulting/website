// Turning the pipeline into a spreadsheet — for decision emails, and for the
// record of a cycle after the portal has moved on to the next one.
//
// Pure: no server imports, no I/O. The route decides WHO may export and WHICH
// rows; this decides what a row looks like and how it is encoded.

import type { Applicant, Flag, Review, Stage } from "./types";
import { isScreenReview, screenTotal } from "./types";
import { cycleLabel } from "./cycle";
import { ROUND_KINDS, rubricMax, submittedTotal, type InterviewKind } from "./interview";
import { type Round } from "./rounds";

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
  // The interview rounds, added because the written mean explains nothing about
  // a candidate turned down after being interviewed — the file that names them
  // has to carry the numbers the call was actually made on. Blank for anyone
  // who never sat that round, which is most of the written pool.
  "First round case",
  "First round behavioral",
  "First round total",
  "First round max",
  // One column, because the second round is one sheet. There is no
  // "Final round behavioral" any more, and leaving the header in place with
  // nothing under it would read as an interview that was never scored rather
  // than one that never existed.
  "Final round group case",
  "Final round total",
  "Final round max",
  "Green flags",
  "Red flags",
  "Applied at",
] as const;

/**
 * The panel's mean on one rubric for one candidate, or null if nobody scored it.
 *
 * A MEAN across interviewers rather than a sum: two people scoring the same case
 * produce one case score, not a doubled one. Recomputed from `scores` for the
 * same reason every other total here is — `weighted_total` means whatever the
 * rubric meant on the day it was written.
 */
function rubricMean(kind: InterviewKind, reviews: Review[], applicantId: string): number | null {
  const totals = reviews
    .filter((r) => r.applicant_id === applicantId && r.kind === kind)
    .map((r) => submittedTotal(kind, r.scores))
    .filter((t): t is number => t !== null);
  if (!totals.length) return null;
  return Math.round((totals.reduce((a, b) => a + b, 0) / totals.length) * 100) / 100;
}

/**
 * A round's rubric means and their sum — two for the first round, one for the
 * second.
 *
 * The total stays null unless EVERY rubric in the round has a score, matching
 * `panelStanding`: half a round against the round's full maximum reads as a weak
 * candidate, and a spreadsheet is exactly where that misreading gets acted on.
 * Written against ROUND_KINDS rather than a hardcoded pair, which is why the
 * second round collapsing to a single sheet needed nothing here.
 */
function roundScores(
  round: Exclude<Round, "written">,
  reviews: Review[],
  applicantId: string
): { parts: (number | null)[]; total: number | null; max: number } {
  const kinds = ROUND_KINDS[round];
  const parts = kinds.map((k) => rubricMean(k, reviews, applicantId));
  const max = kinds.reduce((n, k) => n + rubricMax(k), 0);
  const total = parts.every((p) => p !== null)
    ? Math.round((parts as number[]).reduce((a, b) => a + b, 0) * 100) / 100
    : null;
  return { parts, total, max };
}

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

  const first = roundScores("first_round", reviews, applicant.id);
  const final = roundScores("final_round", reviews, applicant.id);

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
    // Empty rather than 0 for a round somebody never sat. A zero is a real score
    // on these rubrics — every category "Unacceptable Answer" — and writing one
    // where there was no interview would libel a candidate in a file that gets
    // forwarded.
    first.parts[0] ?? "",
    first.parts[1] ?? "",
    first.total ?? "",
    first.total === null ? "" : first.max,
    final.parts[0] ?? "",
    final.total ?? "",
    final.total === null ? "" : final.max,
    own.filter((f) => f.color === "green").length,
    own.filter((f) => f.color === "red").length,
    applicant.created_at,
  ];
}

/** `cube-applicants-fa26-first_round-rejected-2026-08-30.csv` — cycle, round and
 *  outcome in the name, because these files pile up in a downloads folder and
 *  "export.csv" tells you nothing three weeks later. The round matters most of
 *  all: two files both called "…-rejected.csv" are indistinguishable, and one of
 *  them is the people who never got an interview. */
/**
 * The named CSV lists the dashboard offers, in the order the decision emails go
 * out on the night: the cuts, then the holds, then the offers.
 *
 * They exist because `stage` alone cannot express most of them. Everyone cut on
 * their written application and everyone cut after two interviews both sit at
 * `rejected`, and those groups get very different letters — one has never met
 * us, the other spent two conversations with us and came within a seat of an
 * offer. Which round a rejection came after is inferred from the rubrics each
 * round left behind (./cohort.ts), which is server-side work; hand an exec the
 * stage filter and trust them to reconstruct it at 1am and the wrong template
 * goes to 227 people.
 *
 * Held as STAGE AND ROUND rather than as a query string on purpose. `stage` is
 * typed, so a typo is a compile error rather than a filter the route silently
 * drops — and a dropped `stage=` does not export nothing, it exports EVERYONE.
 * A mistyped waitlist list would put all 328 applicants in the file labelled as
 * the four people being held.
 */
export type DecisionExport = {
  label: string;
  /** What the group is, in the words the person downloading it would use. */
  title: string;
  stage?: Stage;
  round?: Round;
};

export const DECISION_EXPORTS: readonly DecisionExport[] = [
  {
    label: "Rejected after first round",
    title: "Everyone interviewed in the first round and then turned down — not the written rejections",
    round: "first_round",
    stage: "rejected",
  },
  {
    label: "Rejected after second round",
    title: "Everyone turned down after their final interview — a different letter from the first-round cuts",
    round: "final_round",
    stage: "rejected",
  },
  {
    label: "Waitlist",
    title: "Everyone held after the final round, waiting on how many seats are left",
    stage: "waitlisted",
  },
  {
    label: "Offers",
    title: "Everyone holding an offer they have not yet accepted — who the offer letter still has to reach",
    stage: "offer",
  },
  {
    label: "Reached final round",
    title: "Everyone who reached the final round, whatever has happened to them since",
    round: "final_round",
  },
];

/** The query string for one named list, as /api/recruitment/export reads it. */
export function decisionExportQuery(x: DecisionExport): string {
  const params = new URLSearchParams();
  if (x.round) params.set("round", x.round);
  if (x.stage) params.set("stage", x.stage);
  return params.size ? `?${params}` : "";
}

/**
 * Whether a list's size can be counted from the stage column alone, so the
 * button can show the number that will be in the file.
 *
 * True only when a stage IS the whole group. Add a round and the answer depends
 * on which round a candidate reached, which the dashboard cannot see —
 * `roundOfStage("rejected")` is null by design — so any number would be a guess
 * about a mailing list. A count that disagrees with its file is worse than none.
 */
export function isCountableFromStage(x: DecisionExport): boolean {
  return Boolean(x.stage) && !x.round;
}

export function exportFilename(
  cycle: string,
  stage: string | null,
  today = new Date(),
  round: Round | null = null
): string {
  const date = today.toISOString().slice(0, 10);
  const inRound = round && round !== "written" ? `-${round}` : "";
  const scope = stage && stage !== "all" ? `-${stage}` : "";
  return `cube-applicants-${cycle}${inRound}${scope}-${date}.csv`;
}
