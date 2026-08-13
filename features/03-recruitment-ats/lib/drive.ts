// Server-only Google Drive access for resumes. Imports `googleapis` — never import
// from client code.
//
// Auth is the same service account the pipeline/sheet importer already uses
// (GOOGLE_SERVICE_ACCOUNT_JSON), with drive.readonly added to the scope list.
// An API key is deliberately NOT accepted here: resumes live in a private folder,
// and API-key auth can only read world-readable files — which is exactly what we
// don't want applicant PII to be.

import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import type { DriveFileMeta } from "./resume-match";

const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"];

/** Mime types we accept as a resume. Anything else in the folder is ignored. */
const RESUME_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.google-apps.document",
]);

const GOOGLE_DOC = "application/vnd.google-apps.document";

/** Accepts a raw folder id or a full Drive folder URL. */
export function extractFolderId(raw: string): string {
  const m = /\/folders\/([a-zA-Z0-9-_]+)/.exec(raw);
  return m ? m[1] : raw.trim();
}

function driveClient(): drive_v3.Drive | null {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const creds = JSON.parse(saJson);
    const jwt = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: DRIVE_SCOPES,
    });
    return google.drive({ version: "v3", auth: jwt });
  } catch {
    return null;
  }
}

export type ListResult =
  | { ok: true; files: DriveFileMeta[] }
  | { ok: false; error: string };

/**
 * Every resume-shaped file in `folderId`, following pagination. One network round
 * trip per 1000 files, so a full cohort is typically a single call.
 */
export async function listResumeFiles(folderIdRaw: string): Promise<ListResult> {
  const drive = driveClient();
  if (!drive) {
    return { ok: false, error: "GOOGLE_SERVICE_ACCOUNT_JSON is not set (a service account is required to read a private resume folder)." };
  }
  const folderId = extractFolderId(folderIdRaw);
  if (!folderId) return { ok: false, error: "A Drive folder id or URL is required." };

  const files: DriveFileMeta[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime)",
        pageSize: 1000,
        orderBy: "modifiedTime desc",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name) continue;
        if (f.mimeType && !RESUME_MIMES.has(f.mimeType)) continue;
        files.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType ?? undefined,
          modifiedTime: f.modifiedTime ?? undefined,
        });
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to list the Drive folder" };
  }

  return { ok: true, files };
}

export type FetchResult =
  | { ok: true; bytes: ArrayBuffer; mime: string }
  | { ok: false; error: string; status: number };

/**
 * The file's bytes, for streaming through our own auth-gated route. Google Docs
 * are exported to PDF so the viewer only ever has to render one format.
 */
export async function fetchResumeBytes(fileId: string, mime?: string): Promise<FetchResult> {
  const drive = driveClient();
  if (!drive) return { ok: false, error: "Drive is not configured.", status: 503 };

  try {
    if (mime === GOOGLE_DOC) {
      const res = await drive.files.export(
        { fileId, mimeType: "application/pdf" },
        { responseType: "arraybuffer" }
      );
      return { ok: true, bytes: res.data as ArrayBuffer, mime: "application/pdf" };
    }
    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" }
    );
    return {
      ok: true,
      bytes: res.data as ArrayBuffer,
      mime: mime || "application/octet-stream",
    };
  } catch (e) {
    const status = (e as { code?: number })?.code;
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to fetch the resume",
      status: status === 404 ? 404 : 502,
    };
  }
}
