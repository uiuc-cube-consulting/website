// Server-only Google Drive/Docs WRITES. Imports `googleapis` — never import from
// client code.
//
// Separate module from ./drive.ts (which only reads resumes) because writing has
// a constraint reading does not, and it is worth stating where the code lives:
//
//   A service account has NO Drive storage quota and cannot own files. Creating a
//   folder or copying a resume into someone's My Drive fails with
//   `storageQuotaExceeded` no matter what it has been shared on.
//
// The escape is a SHARED DRIVE. A shared drive owns its own contents, so files
// created there have no individual owner and the service account never needs
// quota. It also means the recruiting tree belongs to the org rather than to
// whichever officer happened to authorize it — nothing to transfer at graduation.
//
// Setup: create a shared drive, add the service account's `client_email` as
// **Content Manager** (Viewer/Commenter/Contributor cannot create folders), and
// set RECRUITING_DRIVE_ROOT_FOLDER_ID to the drive (or a folder inside it).

import { google } from "googleapis";
import type { drive_v3, docs_v1 } from "googleapis";
import { driveFileUrl, driveFolderUrl } from "./form-resume";
import type { DocsRequest } from "./rubric-doc";

/**
 * Full `drive` rather than `drive.file`: the resume was created by the Google
 * Form, not by this app, and `drive.file` only ever grants access to an app's
 * own files. `documents` covers writing the rubric bodies.
 */
const WRITE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";

/**
 * Every call carries these. `supportsAllDrives` is required on any create/copy/get
 * that touches a shared drive — omit it and the API pretends the shared drive does
 * not exist, returning a confusing 404 rather than a permission error.
 */
const SHARED = { supportsAllDrives: true } as const;

export type Clients = { drive: drive_v3.Drive; docs: docs_v1.Docs };

/** Drive + Docs clients from the shared service account, or null when unconfigured. */
export function driveWriteClients(): Clients | null {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const creds = JSON.parse(saJson);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: WRITE_SCOPES,
    });
    return {
      drive: google.drive({ version: "v3", auth }),
      docs: google.docs({ version: "v1", auth }),
    };
  } catch {
    return null;
  }
}

export type DriveError = { ok: false; error: string };
export type Created<T> = { ok: true; value: T };
export type DriveResult<T> = Created<T> | DriveError;

export type DriveFile = { id: string; name: string; url: string };

/**
 * Turn a Drive API error into something an exec reading the report can act on.
 * The two failure modes that actually happen in this flow are both permission
 * problems that Google reports obscurely, so name them explicitly.
 */
function fail(e: unknown, what: string): DriveError {
  const msg = e instanceof Error ? e.message : String(e);
  let hint = "";
  if (/storageQuotaExceeded|storage quota/i.test(msg)) {
    hint =
      " — the target is not a shared drive. A service account cannot own files in My Drive; " +
      "point RECRUITING_DRIVE_ROOT_FOLDER_ID at a shared drive.";
  } else if (/File not found|notFound|404/i.test(msg)) {
    hint =
      " — not found or not shared. Add the service account's client_email to the shared drive " +
      "as Content Manager.";
  } else if (/insufficientFilePermissions|forbidden|403/i.test(msg)) {
    hint = " — the service account needs Content Manager on the shared drive, not Viewer.";
  }
  return { ok: false, error: `${what}: ${msg}${hint}` };
}

/** Drive treats a name as free text in a query; a stray quote breaks the filter. */
function escapeQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * The folder named `name` under `parentId`, creating it only if absent.
 *
 * Look-up-then-create rather than create-blindly: Drive happily allows two
 * folders with the same name in the same parent, so a re-run would otherwise
 * silently fan out duplicates. Combined with the stable names from
 * folder-naming.ts, this is what makes provisioning idempotent even for a
 * candidate whose ledger row was lost.
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
      includeItemsFromAllDrives: true,
      ...SHARED,
    });
    const hit = found.data.files?.[0];
    if (hit?.id) {
      return { ok: true, value: { id: hit.id, name: hit.name ?? name, url: driveFolderUrl(hit.id) } };
    }

    const made = await clients.drive.files.create({
      requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: "id, name",
      ...SHARED,
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
      ...SHARED,
    });
    return { ok: true, value: { name: res.data.name ?? "", mimeType: res.data.mimeType ?? null } };
  } catch (e) {
    return fail(e, `Could not read Drive file ${fileId}`);
  }
}

/**
 * Copy a Drive file into a candidate's folder under a consistent name.
 *
 * Used for both artifacts a candidate folder holds: the resume the Form
 * collected, and each of the two rubric sheets. A copy, not a move, in both
 * cases — the resume's original stays in the Form's "(File responses)" folder so
 * the response sheet's link keeps working, and the rubric's original stays the
 * master every other candidate is copied from. Because the destination is a
 * shared drive, the copy is owned by the drive and costs the service account no
 * quota.
 */
export async function copyInto(
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
      ...SHARED,
    });
    const id = res.data.id;
    if (!id) return { ok: false, error: `Drive returned no id when copying ${sourceFileId}` };
    return { ok: true, value: { id, name: res.data.name ?? newName, url: driveFileUrl(id) } };
  } catch (e) {
    return fail(e, `Could not copy ${sourceFileId} into ${destFolderId}`);
  }
}

/**
 * Create a Google Doc in `parentId` and fill it with `requests`.
 *
 * Two calls, not one: the Docs API creates an empty document with no way to set a
 * parent, so the file is created through Drive first (which does take a parent)
 * and the body is written second. The other order would strand an untitled doc in
 * the drive root if the move failed.
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
      ...SHARED,
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
 * Lets a repair run rebuild the tree after someone deletes a rubric doc by hand.
 */
export async function stillExists(clients: Clients, fileId: string): Promise<boolean> {
  try {
    const res = await clients.drive.files.get({ fileId, fields: "trashed", ...SHARED });
    return res.data.trashed !== true;
  } catch {
    return false;
  }
}
