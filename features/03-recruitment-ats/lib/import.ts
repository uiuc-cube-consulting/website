// Server-only: read a Google Sheet of application/form responses and map it to
// importable applicant rows. Imports `googleapis`, so never import from client code.
// Header mapping is fuzzy (case-insensitive) so it works with most Google Form
// response sheets; unmatched columns are preserved in `responses`.

import { google } from "googleapis";
import type { ImportRow } from "./store";

function extractSheetId(raw: string): string {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(raw);
  return m ? m[1] : raw.trim();
}

function sheetsClient() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    try {
      const creds = JSON.parse(saJson);
      const jwt = new google.auth.JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
      });
      return google.sheets({ version: "v4", auth: jwt });
    } catch {
      // fall through
    }
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) return google.sheets({ version: "v4", auth: apiKey });
  return null;
}

// First header (case-insensitive, accent-insensitive) that contains any needle.
// Stripping diacritics means a "Résumé" column matches the plain "resume" needle
// whether the sheet stores it precomposed or as a combining accent.
function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function findCol(headers: string[], needles: string[]): number {
  const lower = headers.map(normalizeHeader);
  for (let i = 0; i < lower.length; i++) {
    if (needles.some((n) => lower[i].includes(n))) return i;
  }
  return -1;
}

/** First header matching a needle, ignoring columns already claimed elsewhere. */
function findColExcept(headers: string[], needles: string[], taken: number[], veto: string[] = []): number {
  const lower = headers.map(normalizeHeader);
  for (let i = 0; i < lower.length; i++) {
    if (taken.includes(i)) continue;
    if (veto.some((v) => lower[i].includes(v))) continue;
    if (needles.some((n) => lower[i].includes(n))) return i;
  }
  return -1;
}

export type ColumnMap = {
  first: number;
  last: number;
  name: number;
  email: number;
  year: number;
  major: number;
  college: number;
  resume: number;
  /** Columns consumed above, which must not be duplicated into `responses`. */
  core: Set<number>;
};

/**
 * Header row -> column indices. Pure and exported so the mapping can be tested
 * against a real form's headers without touching the network.
 *
 * The subtle one is the name. A Google Form asking for a name usually splits it
 * into "First Name" / "Last Name" rather than offering a single "Name" field —
 * and a naive search for a header containing "name" matches "First Name" and
 * silently produces half a name, which then becomes half a folder name. So the
 * split pair is detected FIRST and only then do we look for a single-field name,
 * vetoing headers like "NetID"/"username" that contain "name" without being one.
 */
export function mapColumns(headers: string[]): ColumnMap {
  const first = findCol(headers, ["first name", "firstname", "given name"]);
  const last = findCol(headers, ["last name", "lastname", "surname", "family name"]);
  const name = findColExcept(headers, ["name"], [first, last], [
    "netid", "username", "user name", "file name", "nickname", "name of",
  ]);
  const email = findCol(headers, ["email", "e-mail"]);
  const year = findCol(headers, ["year", "grade", "class"]);
  const major = findCol(headers, ["major"]);
  const college = findCol(headers, ["college", "school"]);
  // The Form's file-upload question. Its header is whatever the form author typed
  // ("Please upload your resume as .pdf", "Resume (PDF)", "CV"), so match on any
  // of those words. Ordering matters: an essay prompt mentioning "your resume"
  // appears later in a form than the upload question itself, and findCol takes
  // the first match.
  const resume = findCol(headers, ["resume", "cv", "upload"]);

  const core = new Set([first, last, name, email, year, major, college, resume].filter((x) => x >= 0));
  return { first, last, name, email, year, major, college, resume, core };
}

/** Join whatever name columns the form actually had. */
function nameFrom(cols: ColumnMap, cell: (i: number) => string): string {
  const first = cell(cols.first);
  const last = cell(cols.last);
  if (first && last) return `${first} ${last}`;
  return cell(cols.name) || first || last;
}

/**
 * Sheet values (row 1 = headers) -> ImportRow[]. Pure; the network half lives in
 * readApplicantsFromSheet. Rows with no email are skipped — email is the dedupe key.
 */
export function rowsFromValues(values: string[][]): ImportRow[] {
  if (values.length < 2) return [];
  const headers = values[0].map((h) => String(h ?? "").trim());
  const cols = mapColumns(headers);

  const rows: ImportRow[] = [];
  for (const r of values.slice(1)) {
    const cell = (i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const email = cell(cols.email);
    if (!email) continue;
    const responses: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      if (cols.core.has(i)) continue;
      const key = headers[i] || `col_${i + 1}`;
      const val = String(r[i] ?? "").trim();
      if (val) responses[key] = val;
    }
    rows.push({
      name: nameFrom(cols, cell) || email,
      email,
      year: cell(cols.year) || undefined,
      major: cell(cols.major) || undefined,
      college: cell(cols.college) || undefined,
      resumeLink: cell(cols.resume) || undefined,
      responses,
    });
  }
  return rows;
}

export type ImportReadResult =
  | { ok: true; rows: ImportRow[]; total: number }
  | { ok: false; error: string };

/**
 * Read `range` (default first sheet, A1:Z) and map rows to ImportRow. Row 1 is the
 * header. Recognized columns: name, email, year, major, college, and the Form's
 * resume-upload column; everything else is stored under `responses` keyed by its
 * header so no answer is lost.
 */
export async function readApplicantsFromSheet(sheetIdRaw: string, range = "A1:Z"): Promise<ImportReadResult> {
  const client = sheetsClient();
  if (!client) return { ok: false, error: "No Google credentials (GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_API_KEY)." };
  if (!sheetIdRaw) return { ok: false, error: "A sheet id or URL is required." };

  let values: string[][];
  try {
    const res = await client.spreadsheets.values.get({ spreadsheetId: extractSheetId(sheetIdRaw), range });
    values = (res.data.values ?? []) as string[][];
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to read sheet" };
  }
  const rows = rowsFromValues(values);
  return { ok: true, rows, total: rows.length };
}
