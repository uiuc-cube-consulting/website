// Server-only: reads the pipeline from the outreach Google Sheet. Imports
// `googleapis`, so this must never be imported by a client component — keep client
// imports pointed at ./pipeline.ts (pure). Auth resolution order:
//   1. GOOGLE_SERVICE_ACCOUNT_JSON  → JWT, reads a PRIVATE sheet (recommended; PII)
//   2. GOOGLE_API_KEY               → reads a link-readable sheet
//   3. neither / no PIPELINE_SHEET_ID → demo data (so the board is explorable)
//
// NOTE: only import this module from server code (API routes / server components).
// Client components must import from ./pipeline.ts (pure, no googleapis).

import { google } from "googleapis";
import { DEMO_PIPELINE, normalizeStage, type Lead, type SourceKind } from "./pipeline";

/** Accept a raw Sheet ID or a full Sheet URL and return the bare ID. */
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

// Column contract for PIPELINE_SHEET_RANGE (default "Pipeline!A2:O"):
// 0 name | 1 company | 2 email | 3 industry | 4 source | 5 stage | 6 owner |
// 7 last_contacted | 8 contacted_at | 9 replied_at | 10 call_at | 11 loi_at |
// 12 active_at | 13 shipped_at | 14 notes
function rowToLead(r: string[], i: number): Lead | null {
  const name = (r[0] ?? "").trim();
  const company = (r[1] ?? "").trim();
  if (!name && !company) return null;
  const v = (idx: number) => {
    const s = (r[idx] ?? "").trim();
    return s.length ? s : undefined;
  };
  return {
    id: `${(company || name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`,
    name: name || company,
    company: company || name,
    email: v(2),
    industry: v(3),
    source: v(4),
    stage: normalizeStage(r[5] ?? ""),
    owner: v(6),
    lastContacted: v(7),
    contactedAt: v(8),
    repliedAt: v(9),
    callAt: v(10),
    loiAt: v(11),
    activeAt: v(12),
    shippedAt: v(13),
    notes: v(14),
  };
}

export async function fetchPipeline(): Promise<{ leads: Lead[]; source: SourceKind }> {
  const sheetIdRaw = process.env.PIPELINE_SHEET_ID;
  const client = sheetsClient();
  const range = process.env.PIPELINE_SHEET_RANGE || "Pipeline!A2:O";

  if (!sheetIdRaw || !client) {
    return { leads: DEMO_PIPELINE, source: "demo" };
  }

  const res = await client.spreadsheets.values.get({
    spreadsheetId: extractSheetId(sheetIdRaw),
    range,
  });
  const rows = (res.data.values ?? []) as string[][];
  const leads = rows.map(rowToLead).filter((l): l is Lead => l !== null);
  return { leads, source: "sheet" };
}
