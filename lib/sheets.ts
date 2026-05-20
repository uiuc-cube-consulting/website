// Google Sheets reader for the member points tracker.
//
// We read a single sheet (defaults to "Points") with two columns:
//   Column A: member name
//   Column B: points
//
// Env vars:
//   POINTS_SHEET_ID    — the Sheet ID (the long string in the share URL)
//   POINTS_SHEET_RANGE — defaults to "Points!A2:B"
//   GOOGLE_API_KEY     — an API key with Sheets API enabled (Sheet must be shared link-visible)

import { google } from "googleapis";

export type PointsRow = { name: string; points: number };

export async function fetchPoints(): Promise<PointsRow[]> {
  const sheetId = process.env.POINTS_SHEET_ID;
  const apiKey = process.env.GOOGLE_API_KEY;
  const range = process.env.POINTS_SHEET_RANGE || "Points!A2:B";

  if (!sheetId || !apiKey) {
    // Not yet configured — return a demo roster so the UI is still
    // explorable in dev. Replace by setting env vars in prod.
    return DEMO_POINTS;
  }

  const sheets = google.sheets({ version: "v4", auth: apiKey });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
  });
  const rows = res.data.values ?? [];
  return rows
    .map((r) => ({
      name: String(r[0] ?? "").trim(),
      points: Number(r[1] ?? 0) || 0,
    }))
    .filter((r) => r.name.length > 0);
}

const DEMO_POINTS: PointsRow[] = [
  { name: "Sujan Sriram", points: 142 },
  { name: "Isabella Watson", points: 138 },
  { name: "Mann Talati", points: 127 },
  { name: "Pranav Kathiresan", points: 119 },
  { name: "Jonah Tran", points: 116 },
  { name: "Daniel Zhang", points: 112 },
  { name: "Andrea Turek", points: 108 },
  { name: "Neha Nallamala", points: 105 },
  { name: "Megan Zeng", points: 96 },
  { name: "Emily Park", points: 91 },
];
