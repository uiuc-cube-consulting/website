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

// First header (case-insensitive) that contains any of the needles.
function findCol(headers: string[], needles: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (let i = 0; i < lower.length; i++) {
    if (needles.some((n) => lower[i].includes(n))) return i;
  }
  return -1;
}

export type ImportReadResult =
  | { ok: true; rows: ImportRow[]; total: number }
  | { ok: false; error: string };

/**
 * Read `range` (default first sheet, A1:Z) and map rows to ImportRow. Row 1 is the
 * header. Recognized columns: name, email, year, major, college; everything else is
 * stored under `responses` keyed by its header so no answer is lost.
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
  if (values.length < 2) return { ok: true, rows: [], total: 0 };

  const headers = values[0].map((h) => String(h ?? "").trim());
  const iName = findCol(headers, ["name"]);
  const iEmail = findCol(headers, ["email", "e-mail"]);
  const iYear = findCol(headers, ["year", "grade", "class"]);
  const iMajor = findCol(headers, ["major"]);
  const iCollege = findCol(headers, ["college", "school"]);
  const core = new Set([iName, iEmail, iYear, iMajor, iCollege].filter((x) => x >= 0));

  const rows: ImportRow[] = [];
  for (const r of values.slice(1)) {
    const cell = (i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const email = cell(iEmail);
    if (!email) continue; // email is the dedupe key; skip rows without one
    const responses: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      if (core.has(i)) continue;
      const key = headers[i] || `col_${i + 1}`;
      const val = String(r[i] ?? "").trim();
      if (val) responses[key] = val;
    }
    rows.push({
      name: cell(iName) || email,
      email,
      year: cell(iYear) || undefined,
      major: cell(iMajor) || undefined,
      college: cell(iCollege) || undefined,
      responses,
    });
  }
  return { ok: true, rows, total: rows.length };
}
