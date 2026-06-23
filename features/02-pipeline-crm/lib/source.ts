// Server-only: reads the pipeline from the outreach bot's Google Sheet (the `Leads`
// tab). Imports `googleapis`, so never import this from a client component — keep
// client imports pointed at ./pipeline.ts (pure). Auth resolution order:
//   1. GOOGLE_SERVICE_ACCOUNT_JSON  → JWT, reads a PRIVATE sheet (the bot's account)
//   2. GOOGLE_API_KEY               → reads a link-readable sheet
//   3. neither / no sheet id        → demo data (so the board is explorable)
//
// Sheet id comes from PIPELINE_SHEET_ID, falling back to SHEET_ID (the var the bot
// itself uses) so they can point at the same workbook.

import { google } from "googleapis";
import { DEMO_PIPELINE, normalizeStage, type Lead, type SourceKind, type StageKey } from "./pipeline";

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

// Maps the outreach bot's LeadStatus (Leads tab, `status` column) — and any
// stage word a human types into that column — to a pipeline StageKey.
// Returns null to DROP the row (suppressed / do-not-contact).
//   new, drafted        → prospect      (sourced / draft written, not sent)
//   sent, followed-up   → contacted
//   replied, hot        → replied        (hot = positive reply; book a call next)
//   closed              → shipped        (engagement closed out; adjust if "closed" means lost for you)
//   suppressed          → dropped
//   anything else       → normalizeStage (handles director-entered call/loi/active/shipped/testimonial)
function leadStatusToStage(raw: string): StageKey | null {
  const s = (raw || "").trim().toLowerCase();
  switch (s) {
    case "":
    case "new":
    case "drafted":
      return "prospect";
    case "sent":
    case "followed-up":
    case "followed up":
      return "contacted";
    case "replied":
    case "hot":
      return "replied";
    case "closed":
      return "shipped";
    case "suppressed":
      return null;
    default:
      return normalizeStage(s);
  }
}

// Column contract = the bot's LEADS_HEADERS (Leads!A2:S):
// 0 date_added | 1 name | 2 title | 3 company | 4 email | 5 linkedin | 6 industry |
// 7 location | 8 company_stage | 9 is_uiuc_alum | 10 schools | 11 source | 12 score |
// 13 status | 14 sent_at | 15 replied_at | 16 last_follow_up_at | 17 thread_id | 18 message_id
function rowToLead(r: string[], i: number): Lead | null {
  const name = (r[1] ?? "").trim();
  const company = (r[3] ?? "").trim();
  if (!name && !company) return null;
  const stage = leadStatusToStage(r[13] ?? "");
  if (stage === null) return null; // suppressed / do-not-contact

  const v = (idx: number) => {
    const s = (r[idx] ?? "").trim();
    return s.length ? s : undefined;
  };
  const sentAt = v(14);
  const repliedAt = v(15);
  const followUpAt = v(16);

  return {
    id: `${(company || name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`,
    name: name || company,
    company: company || name,
    email: v(4),
    industry: v(6),
    source: v(11),
    stage,
    owner: undefined, // the bot doesn't assign owners; humans can in the board's source
    lastContacted: followUpAt || repliedAt || sentAt || v(0),
    contactedAt: sentAt,
    repliedAt,
  };
}

export async function fetchPipeline(): Promise<{ leads: Lead[]; source: SourceKind }> {
  const sheetIdRaw = process.env.PIPELINE_SHEET_ID || process.env.SHEET_ID;
  const client = sheetsClient();
  const range = process.env.PIPELINE_SHEET_RANGE || "Leads!A2:S";

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
