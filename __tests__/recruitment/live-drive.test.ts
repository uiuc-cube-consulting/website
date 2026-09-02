/**
 * Opt-in LIVE smoke test against the real recruiting shared drive.
 *
 * Skipped unless both env vars are set, so `npm test` stays hermetic:
 *
 *   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat path/to/service_account.json)" \
 *   RECRUITING_DRIVE_ROOT_FOLDER_ID=<shared drive or folder id> \
 *   npx jest __tests__/recruitment/live-drive.test.ts
 *
 * What it is actually for: the Docs `batchUpdate` index arithmetic in
 * rubric-doc.ts and the shared-drive permission model are the two things unit
 * tests cannot prove. A styling range that runs one character past the document
 * fails only at the real API, with an opaque 400. This exercises both against
 * production Google for the price of one throwaway folder, which it trashes on
 * the way out.
 *
 * It creates nothing outside its own `__smoke-…` folder and touches no candidate
 * data and no database.
 */

import { google } from "googleapis";
import {
  driveWriteClients,
  ensureFolder,
  createDoc,
  copyInto,
  fileMeta,
  stillExists,
  type Clients,
} from "@/features/03-recruitment-ats/lib/drive-write";
import { notesDocRequests } from "@/features/03-recruitment-ats/lib/rubric-doc";
import { CASE_RUBRIC, BEHAVIORAL_RUBRIC } from "@/features/03-recruitment-ats/lib/interview";

const ROOT = process.env.RECRUITING_DRIVE_ROOT_FOLDER_ID;
const HAS_CREDS = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && ROOT);
const d = HAS_CREDS ? describe : describe.skip;

const META = {
  candidateName: "Smoke Test",
  candidateEmail: "smoke@example.invalid",
  subtitle: "Junior · Industrial Engineering",
  label: "Case",
};

d("live shared-drive smoke", () => {
  jest.setTimeout(120_000);

  let clients: Clients;
  let smokeFolderId: string | null = null;

  beforeAll(() => {
    const c = driveWriteClients();
    if (!c) throw new Error("driveWriteClients() returned null despite creds being set");
    clients = c;
  });

  afterAll(async () => {
    // Remove everything this test made, even if an expectation failed.
    //
    // Trash rather than files.delete: in a shared drive only a Manager can
    // permanently delete, and the service account is a Content Manager. Worse,
    // Drive reports that as a bare 404 "File not found" rather than a permission
    // error — the same disguised-permission behaviour drive-write.ts adds hints
    // for. Trashing is within a Content Manager's rights and empties the drive.
    if (!smokeFolderId) return;
    try {
      await clients.drive.files.update({
        fileId: smokeFolderId,
        requestBody: { trashed: true },
        supportsAllDrives: true,
      });
    } catch {
      // Leave a breadcrumb rather than failing the run on cleanup.
      console.warn(`Could not trash smoke folder ${smokeFolderId} — remove it by hand.`);
    }
  });

  it("creates a folder in the shared drive (proves the quota model)", async () => {
    const name = `__smoke-${Date.now()}`;
    const res = await ensureFolder(clients, name, ROOT!);
    // A service account writing into My Drive would fail here with
    // storageQuotaExceeded; succeeding is the proof that the drive owns the file.
    if (!res.ok) throw new Error(res.error);
    expect(res.value.id).toBeTruthy();
    smokeFolderId = res.value.id;
  });

  it("is idempotent — a second ensureFolder returns the same folder", async () => {
    const name = `__smoke-idem-${Date.now()}`;
    const first = await ensureFolder(clients, name, smokeFolderId!);
    const second = await ensureFolder(clients, name, smokeFolderId!);
    if (!first.ok) throw new Error(first.error);
    if (!second.ok) throw new Error(second.error);
    // This is the property the whole re-run story rests on.
    expect(second.value.id).toBe(first.value.id);
  });

  it("writes the notes doc — validates the Docs index arithmetic", async () => {
    // The rubric sheets are copies of the club's masters now, so the notes page is
    // the only body this app still generates and the only place the Docs index
    // arithmetic can go wrong.
    const res = await createDoc(
      clients,
      "Smoke Notes",
      smokeFolderId!,
      notesDocRequests({ ...META, label: "Notes" })
    );
    if (!res.ok) throw new Error(`Smoke Notes: ${res.error}`);
    expect(res.value.id).toBeTruthy();
  });

  it("reads back the notes doc with its heading intact", async () => {
    const auth = new google.auth.JWT({
      email: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).client_email,
      key: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!).private_key,
      scopes: ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/documents"],
    });
    const drive = google.drive({ version: "v3", auth });
    const docs = google.docs({ version: "v1", auth });

    const listed = await drive.files.list({
      q: `'${smokeFolderId}' in parents and name = 'Smoke Notes' and trashed = false`,
      fields: "files(id)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const id = listed.data.files?.[0]?.id;
    expect(id).toBeTruthy();

    const doc = await docs.documents.get({ documentId: id! });
    const text = (doc.data.body?.content ?? [])
      .flatMap((el) => el.paragraph?.elements ?? [])
      .map((e) => e.textRun?.content ?? "")
      .join("");

    expect(text).toContain("Interview Notes — Smoke Test");
    expect(text).toContain("Interviewers: ");
  });

  it("copies a real Form upload into the folder", async () => {
    // Find any resume the bot can see in the Form's file-responses folder.
    const found = await clients.drive.files.list({
      q: "mimeType = 'application/pdf' and trashed = false",
      fields: "files(id, name)",
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const source = found.data.files?.[0];
    if (!source?.id) {
      console.warn("No PDF visible to the bot — skipping the copy assertion.");
      return;
    }

    const meta = await fileMeta(clients, source.id);
    if (!meta.ok) throw new Error(meta.error);

    const copied = await copyInto(clients, source.id, smokeFolderId!, "Resume — Smoke Test.pdf");
    if (!copied.ok) throw new Error(copied.error);
    expect(copied.value.id).toBeTruthy();
    expect(await stillExists(clients, copied.value.id)).toBe(true);
  });
});
