// Server-only Google Drive/Docs WRITES. Imports `googleapis` — never import from
// client code.
//
// This is deliberately a separate module from ./drive.ts, which reads resumes
// with the service account. The two cannot share a client, because of a hard
// Google constraint worth stating where the code lives:
//
//   A service account has NO Drive storage quota and cannot own files. Creating
//   a folder or copying a resume as `cube-outreach-bot@...` fails with
//   `storageQuotaExceeded`, no matter what it has been shared on. The only ways
//   to write are a Shared Drive (Workspace only) or acting as a real user via
//   OAuth. CUBE is on a personal Gmail account, so: OAuth, acting as the
//   recruiting officer who already owns the Form, the responses and the folders.
//
// The refresh token is minted once by `scripts/drive-consent.mjs`. Its OAuth
// client must live in the cube-project-496921 GCP project, NOT the project
// behind AUTH_GOOGLE_ID — restricted scopes attach to a project's consent
// screen, and adding `drive` there would show an unverified-app warning to every
// member signing into the portal.

import { google } from "googleapis";
import type { drive_v3, docs_v1 } from "googleapis";
import { driveFileUrl, driveFolderUrl } from "./form-resume";
import type { DocsRequest } from "./rubric-doc";

/**
 * Full `drive` rather than the friendlier `drive.file`. Not a shortcut: the
 * resume was created by the Google Form, not by this app, and `drive.file` only
 * ever grants access to files the app itself created. Copying someone else's
 * file requires the broad scope. `documents` covers writing the rubric bodies.
 */
const WRITE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";

export type Clients = { drive: drive_v3.Drive; docs: docs_v1.Docs };

/**
 * OAuth2 client from the stored refresh token, or null when unconfigured.
 * googleapis refreshes the access token on demand, so nothing here is cached
 * across requests — a serverless invocation makes one token call then proceeds.
 */
export function driveWriteClients(): Clients | null {
  const clientId = process.env.RECRUITING_DRIVE_CLIENT_ID;
  const clientSecret = process.env.RECRUITING_DRIVE_CLIENT_SECRET;
  const refreshToken = process.env.RECRUITING_DRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2({ clientId, clientSecret });
  auth.setCredentials({ refresh_token: refreshToken, scope: WRITE_SCOPES.join(" ") });
  return {
    drive: google.drive({ version: "v3", auth }),
    docs: google.docs({ version: "v1", auth }),
  };
}

export type DriveError = { ok: false; error: string };
export type Created<T> = { ok: true; value: T };
export type DriveResult<T> = Created<T> | DriveError;

export type DriveFile = { id: string; name: string; url: string };

function fail(e: unknown, what: string): DriveError {
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, error: `${what}: ${msg}` };
}

/** Drive treats a name as free text in a query; a stray quote breaks the filter. */
function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * The folder named `name` under `parentId`, creating it only if absent.
 *
 * Look-up-then-create rather than create-blindly: Drive happily allows two
 * folders with the same name in the same parent, so a re-run of provisioning
 * would otherwise silently fan out duplicates. Combined with the stable names
 * from folder-naming.ts, this is what makes the whole operation idempotent even
 * for candidates whose ledger row was lost.
 */
export async function ensureFolder(
  clients: Clients,
  name: string,
  parentId: string
): Promise<DriveResult<DriveFile>> {
  try {
    const q = [
      `name = '${escapeQuery(name)}'`,
      `'${escapeQuery(parentId)}' in parents`,
      `mimeType = '${FOLDER_MIME}'`,
      "trashed = false",
    ].join(" and ");

    const found = await clients.drive.files.list({
      q,
      fields: "files(id, name)",
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const hit = found.data.files?.[0];
    if (hit?.id) {
      return { ok: true, value: { id: hit.id, name: hit.name ?? name, url: driveFolderUrl(hit.id) } };
    }

    const made = await clients.drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id, name",
      supportsAllDrives: true,
    });
    const id = made.data.id;
    if (!id) return { ok: false, error: `Drive returned no id when creating folder "${name}"` };
    return { ok: true, value: { id, name: made.data.name ?? name, url: driveFolderUrl(id) } };
  } catch (e) {
    return fail(e, `Could not ensure folder "${name}"`);
  }
}

/** Metadata for a file we are about to copy — used to keep the extension right. */
export async function fileMeta(
  clients: Clients,
  fileId: string
): Promise<DriveResult<{ name: string; mimeType: string | null }>> {
  try {
    const res = await clients.drive.files.get({
      fileId,
      fields: "name, mimeType",
      supportsAllDrives: true,
    });
    return { ok: true, value: { name: res.data.name ?? "", mimeType: res.data.mimeType ?? null } };
  } catch (e) {
    return fail(e, `Could not read Drive file ${fileId}`);
  }
}

/**
 * Copy the Form's uploaded resume into the candidate's folder under a consistent
 * name. A copy, not a move: the original stays where the Form put it, so the
 * response sheet's link keeps working and nothing about the submission record is
 * disturbed.
 */
export async function copyResume(
  clients: Clients,
  sourceFileId: string,
  destFolderId: string,
  newName: string
): Promise<DriveResult<DriveFile>> {
  try {
    const res = await clients.drive.files.copy({
      fileId: sourceFileId,
      requestBody: { name: newName, parents: [destFolderId] },
      fields: "id, name",
      supportsAllDrives: true,
    });
    const id = res.data.id;
    if (!id) return { ok: false, error: "Drive returned no id when copying the resume" };
    return { ok: true, value: { id, name: res.data.name ?? newName, url: driveFileUrl(id) } };
  } catch (e) {
    return fail(e, `Could not copy resume ${sourceFileId}`);
  }
}

/**
 * Create a Google Doc in `parentId` and fill it with `requests`.
 *
 * Two calls, not one: the Docs API creates an empty document with no way to set
 * a parent, so the file is created through Drive first (which does take a
 * parent) and the body is written second. Doing it the other way round would
 * leave a stray untitled doc in the account root if the move failed.
 */
export async function createDoc(
  clients: Clients,
  title: string,
  parentId: string,
  requests: DocsRequest[]
): Promise<DriveResult<DriveFile>> {
  let id: string;
  try {
    const made = await clients.drive.files.create({
      requestBody: { name: title, mimeType: DOC_MIME, parents: [parentId] },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!made.data.id) return { ok: false, error: `Drive returned no id when creating "${title}"` };
    id = made.data.id;
  } catch (e) {
    return fail(e, `Could not create doc "${title}"`);
  }

  if (requests.length) {
    try {
      await clients.docs.documents.batchUpdate({
        documentId: id,
        requestBody: { requests: requests as docs_v1.Schema$Request[] },
      });
    } catch (e) {
      // The doc exists but is empty. Report it rather than pretending success —
      // the ledger will not record it, so the next run recreates it properly.
      return fail(e, `Created "${title}" but could not write its contents`);
    }
  }
  return { ok: true, value: { id, name: title, url: `https://docs.google.com/document/d/${id}/edit` } };
}

/**
 * Whether a previously provisioned file still exists and is not trashed.
 * Lets a re-run repair the tree after someone deletes a rubric doc by hand.
 */
export async function stillExists(clients: Clients, fileId: string): Promise<boolean> {
  try {
    const res = await clients.drive.files.get({
      fileId,
      fields: "trashed",
      supportsAllDrives: true,
    });
    return res.data.trashed !== true;
  } catch {
    return false;
  }
}
