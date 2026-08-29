// Server-only orchestration: Google Form responses -> per-candidate Drive folders,
// for the FIRST ROUND. Imports googleapis (transitively, via ./drive-write) —
// never import from client code.
//
// Folders are a first-round artifact, not an application-time one. A folder holds
// the resume plus the case and behavioral rubric docs, and those rubrics only mean
// anything once a candidate is actually being interviewed. Provisioning the whole
// written pool would create hundreds of folders — one per applicant, most of them
// for people who will never reach an interview — each with two rubric docs nobody
// opens, at ~5 Drive calls apiece. So this run is scoped to candidates whose stage
// puts them in the first round (lib/rounds.ts), and re-running it after each batch
// of advancement decisions picks up exactly the people who just moved.
//
// Shape of the run, modeled on syncResumes in ./interview-store.ts:
//   1. read the Form's response sheet
//   2. upsert the applicants it names (deduped by email, as the importer does)
//   3. narrow to the ones currently in the first round
//   4. for each, create only the Drive artifacts that are missing
//   5. record what exists in `candidate_drive_assets` and point the applicant row
//      at the folder
//
// The whole thing is idempotent. Re-running after adding 20 applicants creates
// 20 folders and touches nothing else, and re-running after a partial failure
// picks up exactly where it stopped. Two mechanisms give us that:
//   - the `candidate_drive_assets` ledger, checked before any Drive write
//   - stable, collision-free folder names (./folder-naming.ts) plus the
//     look-up-then-create in ensureFolder, so even a lost ledger row cannot
//     produce a duplicate folder

import { createServerClient } from "@/lib/supabase/server";
import { readApplicantsFromSheet } from "./import";
import { importApplicants } from "./store";
import { parseResumeId } from "./form-resume";
import {
  candidateFolderName,
  cycleFolderName,
  docTitle,
  resumeFileName,
} from "./folder-naming";
import { rubricDocRequests, notesDocRequests, type RubricDocMeta } from "./rubric-doc";
import { CASE_RUBRIC, BEHAVIORAL_RUBRIC } from "./interview";
import { ROUND_STAGES } from "./rounds";
import { cycleLabel, normalizeCycle } from "./cycle";
import { getActiveCycle } from "./visibility";
import {
  driveWriteClients,
  ensureFolder,
  copyResume,
  createDoc,
  fileMeta,
  stillExists,
  type DriveFile,
} from "./drive-write";

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

/** The artifacts we provision per candidate. Mirrors the CHECK in db/drive-folders.sql. */
export const ASSET_KINDS = ["folder", "resume", "case_rubric", "behavioral_rubric", "notes"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type ProvisionOptions = {
  /** Sheet id or URL. Falls back to RECRUITING_FORM_SHEET_ID. */
  sheetId?: string;
  /** A1 range, e.g. "Form Responses 1!A1:Z". Falls back to RECRUITING_FORM_SHEET_RANGE. */
  range?: string;
  /**
   * The cycle to provision, canonical ("fa26"). Defaults to the ACTIVE cycle.
   *
   * This is the cycle key, not the folder name: it scopes which applicants are
   * considered and it names the Drive subfolder via `cycleLabel`.
   */
  cycleKey?: string;
  /**
   * Override the Drive subfolder name ("Fall 2026"). Normally left unset — the
   * name is derived from `cycleKey` so the folder tree cannot disagree with the
   * cycle the applicants belong to.
   *
   * That drift was a real hazard: the label used to come from
   * RECRUITING_CYCLE_LABEL, so opening a new cycle in the portal without also
   * redeploying with a new env var would file every new candidate under last
   * cycle's folder. And because `candidateFolderName` is stable across cycles by
   * design, a returning applicant's folder would resolve to their OLD one and the
   * new resume and rubric docs would land on top of it.
   */
  cycle?: string;
  /** Drive folder everything is created under. Falls back to RECRUITING_DRIVE_ROOT_FOLDER_ID. */
  rootFolderId?: string;
  /**
   * Verify each ledger-recorded file still exists in Drive and recreate the ones
   * a human deleted. Costs one extra API call per asset, so it is off by default
   * and offered as an explicit "repair" run.
   */
  repair?: boolean;
  /**
   * Provision at most this many candidates in one call, returning `remaining` so
   * the caller can continue. Exists because a cohort does not fit in a serverless
   * request: ~8s of Drive/Docs work per candidate means 100 candidates is several
   * minutes, well past Vercel's 60s (Hobby) or 300s (Pro) ceiling. The ledger
   * already makes resumption free, so the work is simply chunked.
   */
  limit?: number;
};

export type CandidateOutcome = {
  name: string;
  email: string;
  folderUrl?: string;
  created: AssetKind[];
  skipped: AssetKind[];
  /** Non-fatal problems for this candidate; other candidates still provision. */
  errors: string[];
};

export type ProvisionResult =
  | { ok: false; demo: true }
  | { ok: false; error: string }
  | {
      ok: true;
      cycle: string;
      candidates: number;
      foldersCreated: number;
      assetsCreated: number;
      unchanged: number;
      /** Candidates still needing work after this call. Zero means done. */
      remaining: number;
      /** Respondents skipped because they are not in the first round — still in
       *  the written pool, or already past interviews. Not an error. */
      notInRound: number;
      noResume: { name: string; email: string }[];
      failed: { name: string; email: string; error: string }[];
      outcomes: CandidateOutcome[];
    };

type LedgerRow = { applicant_id: string; kind: string; file_id: string; web_link: string | null };

type Candidate = {
  id: string;
  name: string;
  email: string;
  stage?: string | null;
  year?: string | null;
  major?: string | null;
  college?: string | null;
  resumeLink?: string;
  drive_folder_id?: string | null;
};

/**
 * Run `worker` over `items` with at most `limit` in flight.
 *
 * Provisioning is ~5 Drive calls per candidate and a 200-person cohort is 1000
 * calls; serially that is minutes of wall clock. Four at a time is a deliberate
 * middle ground — enough to hide latency, far enough under Drive's per-user
 * write limits that we do not start collecting 403 rateLimitExceeded retries.
 */
async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

/** "Junior · Statistics · LAS" for the doc subtitle; omits whatever is blank. */
function subtitleFor(c: Candidate): string {
  return [c.year, c.major, c.college].map((v) => (v ?? "").trim()).filter(Boolean).join(" · ");
}

export async function provisionCandidateFolders(
  opts: ProvisionOptions = {}
): Promise<ProvisionResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const clients = driveWriteClients();
  if (!clients) {
    return {
      ok: false,
      error:
        "Drive writing is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON, and add that " +
        "service account to the recruiting shared drive as Content Manager.",
    };
  }

  const rootFolderId = (opts.rootFolderId || process.env.RECRUITING_DRIVE_ROOT_FOLDER_ID || "").trim();
  if (!rootFolderId) {
    return {
      ok: false,
      error:
        "No root folder. Set RECRUITING_DRIVE_ROOT_FOLDER_ID to the recruiting SHARED DRIVE " +
        "(or a folder inside it). A My Drive folder will not work — a service account cannot " +
        "own files.",
    };
  }
  const sheetId = (opts.sheetId || process.env.RECRUITING_FORM_SHEET_ID || "").trim();
  if (!sheetId) {
    return { ok: false, error: "No response sheet. Set RECRUITING_FORM_SHEET_ID or pass a sheet URL." };
  }
  const range = (opts.range || process.env.RECRUITING_FORM_SHEET_RANGE || "A1:Z").trim();
  const cycleKey = normalizeCycle(opts.cycleKey) ?? (await getActiveCycle());
  const cycle = cycleFolderName(opts.cycle || cycleLabel(cycleKey));

  // ── 1. Read the Form responses ─────────────────────────────────────────────
  const sheet = await readApplicantsFromSheet(sheetId, range);
  if (!sheet.ok) return { ok: false, error: sheet.error };
  if (!sheet.rows.length) {
    return {
      ok: true, cycle, candidates: 0, foldersCreated: 0, assetsCreated: 0,
      unchanged: 0, remaining: 0, notInRound: 0, noResume: [], failed: [], outcomes: [],
    };
  }

  // ── 2. Make sure every respondent exists as an applicant ───────────────────
  // importApplicants dedupes by email and inserts only the new ones, so this is
  // safe to call on every provisioning run.
  const imported = await importApplicants(sheet.rows, cycleKey);
  if (!imported.ok && !imported.demo) return { ok: false, error: imported.error ?? "Import failed" };

  const emails = [...new Set(sheet.rows.map((r) => r.email.toLowerCase()))];
  // Scoped to the cycle being provisioned: an email can hold an application in
  // several cycles now, and matching the sheet across all of them would pull last
  // semester's row into this semester's folder tree.
  const { data: applicantRows, error: aErr } = await sb
    .from("applicants")
    .select("id, name, email, year, major, college, stage, drive_folder_id")
    .eq("cycle", cycleKey);
  if (aErr) return { ok: false, error: aErr.message };

  const byEmail = new Map(
    (applicantRows ?? []).map((a) => [String(a.email).toLowerCase(), a])
  );
  const resumeLinkByEmail = new Map(
    sheet.rows.map((r) => [r.email.toLowerCase(), r.resumeLink])
  );

  const respondents: Candidate[] = emails.flatMap((e) => {
    const a = byEmail.get(e);
    if (!a) return [];
    return [{
      ...a,
      id: String(a.id),
      name: String(a.name),
      email: String(a.email),
      resumeLink: resumeLinkByEmail.get(e),
    } satisfies Candidate];
  });

  if (!respondents.length) return { ok: false, error: "No applicants matched the sheet rows." };

  // The whole point of the round scoping: only people actually being interviewed
  // get a folder. Everyone else in the sheet is either still being read in the
  // written round or already past this one.
  const firstRound = ROUND_STAGES.first_round as readonly string[];
  const candidates = respondents.filter((c) => firstRound.includes(String(c.stage ?? "")));
  const notInRound = respondents.length - candidates.length;

  if (!candidates.length) {
    return {
      ok: true, cycle, candidates: 0, foldersCreated: 0, assetsCreated: 0,
      unchanged: 0, remaining: 0, notInRound, noResume: [], failed: [], outcomes: [],
    };
  }

  // ── 3. Cycle folder ────────────────────────────────────────────────────────
  const cycleFolder = await ensureFolder(clients, cycle, rootFolderId);
  if (!cycleFolder.ok) return { ok: false, error: cycleFolder.error };

  // ── 4. Existing ledger, so we only create what is missing ──────────────────
  const { data: ledgerRows, error: lErr } = await sb
    .from("candidate_drive_assets")
    .select("applicant_id, kind, file_id, web_link")
    .in("applicant_id", candidates.map((c) => c.id));
  if (lErr) return { ok: false, error: lErr.message };

  const ledger = new Map<string, Map<string, LedgerRow>>();
  for (const row of (ledgerRows ?? []) as LedgerRow[]) {
    if (!ledger.has(row.applicant_id)) ledger.set(row.applicant_id, new Map());
    ledger.get(row.applicant_id)!.set(row.kind, row);
  }

  // ── 5. Provision ───────────────────────────────────────────────────────────
  const newLedger: { applicant_id: string; kind: AssetKind; file_id: string; web_link: string | null }[] = [];
  const applicantPatches: Record<string, unknown>[] = [];

  /**
   * Already fully provisioned according to the ledger, so this call can skip them
   * without a single Drive round trip. A candidate who never uploaded a resume is
   * still "complete" — otherwise they would sit in the pending set forever and
   * `remaining` would never reach zero.
   */
  const isComplete = (c: Candidate): boolean => {
    const have = ledger.get(c.id);
    if (!have) return false;
    for (const k of ["folder", "case_rubric", "behavioral_rubric", "notes"] as const) {
      if (!have.has(k)) return false;
    }
    if (parseResumeId(c.resumeLink) && !have.has("resume")) return false;
    return true;
  };

  // In repair mode nothing can be trusted without checking Drive, so everyone is
  // pending and the per-asset `existing()` check below does the verification.
  const pending = opts.repair ? candidates : candidates.filter((c) => !isComplete(c));
  const alreadyDone = candidates.length - pending.length;

  const limit = Math.max(1, opts.limit ?? (Number(process.env.RECRUITING_PROVISION_BATCH) || 10));
  const batch = pending.slice(0, limit);
  const remaining = pending.length - batch.length;

  const outcomes = await pool(batch, 4, async (c): Promise<CandidateOutcome> => {
    const out: CandidateOutcome = { name: c.name, email: c.email, created: [], skipped: [], errors: [] };
    const have = ledger.get(c.id) ?? new Map<string, LedgerRow>();

    /** Ledger hit that we still trust: present, and (in repair mode) still in Drive. */
    const existing = async (kind: AssetKind): Promise<LedgerRow | null> => {
      const row = have.get(kind);
      if (!row) return null;
      if (opts.repair && !(await stillExists(clients, row.file_id))) return null;
      return row;
    };

    // 5a. The candidate's own folder.
    let folder: DriveFile;
    const folderRow = await existing("folder");
    if (folderRow) {
      folder = { id: folderRow.file_id, name: "", url: folderRow.web_link ?? "" };
      out.skipped.push("folder");
    } else {
      const made = await ensureFolder(
        clients,
        candidateFolderName(c.name, c.email),
        cycleFolder.value.id
      );
      if (!made.ok) {
        out.errors.push(made.error);
        return out; // nothing else can be created without a folder
      }
      folder = made.value;
      newLedger.push({ applicant_id: c.id, kind: "folder", file_id: folder.id, web_link: folder.url });
      out.created.push("folder");
    }
    out.folderUrl = folder.url;

    if (c.drive_folder_id !== folder.id) {
      applicantPatches.push({
        id: c.id,
        name: c.name, // NOT NULL columns must be present in an upsert tuple
        email: c.email,
        drive_folder_id: folder.id,
        drive_folder_url: folder.url,
        drive_provisioned_at: new Date().toISOString(),
      });
    }

    // 5b. The resume, copied out of the Form's upload folder.
    const resumeRow = await existing("resume");
    if (resumeRow) {
      out.skipped.push("resume");
    } else {
      const sourceId = parseResumeId(c.resumeLink);
      if (!sourceId) {
        // Not an error — plenty of rows legitimately have no upload yet.
        out.errors.push("no resume link in the Form response");
      } else {
        const meta = await fileMeta(clients, sourceId);
        const original = meta.ok ? meta.value.name : null;
        const copied = await copyResume(
          clients,
          sourceId,
          folder.id,
          resumeFileName(c.name, original)
        );
        if (!copied.ok) {
          out.errors.push(copied.error);
        } else {
          newLedger.push({ applicant_id: c.id, kind: "resume", file_id: copied.value.id, web_link: copied.value.url });
          out.created.push("resume");
          // Point the portal console at the COPY, not the Form original: the copy
          // lives under CUBE Recruiting, which is the folder shared with the
          // service account that streams resumes to interviewers.
          applicantPatches.push({
            id: c.id,
            name: c.name,
            email: c.email,
            resume_file_id: copied.value.id,
            resume_name: copied.value.name,
            resume_mime: meta.ok ? meta.value.mimeType : null,
            resume_match: "form", // authoritative — the Form told us, we did not guess
            resume_linked_at: new Date().toISOString(),
          });
        }
      }
    }

    // 5c. Rubric docs + notes, generated from the rubrics in interview.ts.
    const meta: RubricDocMeta = {
      candidateName: c.name,
      candidateEmail: c.email,
      subtitle: subtitleFor(c),
      label: "Case",
    };
    const docs: { kind: AssetKind; title: string; requests: ReturnType<typeof rubricDocRequests> }[] = [
      {
        kind: "case_rubric",
        title: docTitle("Case Rubric", c.name),
        requests: rubricDocRequests(CASE_RUBRIC, { ...meta, label: "Case" }),
      },
      {
        kind: "behavioral_rubric",
        title: docTitle("Behavioral Rubric", c.name),
        requests: rubricDocRequests(BEHAVIORAL_RUBRIC, { ...meta, label: "Behavioral" }),
      },
      {
        kind: "notes",
        title: docTitle("Interview Notes", c.name),
        requests: notesDocRequests({ ...meta, label: "Notes" }),
      },
    ];

    for (const d of docs) {
      if (await existing(d.kind)) {
        out.skipped.push(d.kind);
        continue;
      }
      const made = await createDoc(clients, d.title, folder.id, d.requests);
      if (!made.ok) {
        out.errors.push(made.error);
        continue;
      }
      newLedger.push({ applicant_id: c.id, kind: d.kind, file_id: made.value.id, web_link: made.value.url });
      out.created.push(d.kind);
    }

    return out;
  });

  // ── 6. Record what we made ─────────────────────────────────────────────────
  // Written after the Drive work rather than per-candidate: one round trip
  // instead of hundreds, and an upsert so a re-run cannot violate the PK.
  if (newLedger.length) {
    const { error } = await sb
      .from("candidate_drive_assets")
      .upsert(newLedger, { onConflict: "applicant_id,kind" });
    if (error) {
      return { ok: false, error: `Drive artifacts were created but recording them failed: ${error.message}` };
    }
  }
  if (applicantPatches.length) {
    // Merge per-applicant patches so folder and resume updates land in one row.
    const merged = new Map<string, Record<string, unknown>>();
    for (const p of applicantPatches) {
      const id = String(p.id);
      merged.set(id, { ...(merged.get(id) ?? {}), ...p });
    }
    const { error } = await sb
      .from("applicants")
      .upsert([...merged.values()], { onConflict: "id" });
    if (error) return { ok: false, error: `Could not update applicants: ${error.message}` };
  }

  const noResume = outcomes
    .filter((o) => o.errors.some((e) => e.includes("no resume link")))
    .map((o) => ({ name: o.name, email: o.email }));
  const failed = outcomes
    .filter((o) => o.errors.some((e) => !e.includes("no resume link")))
    .map((o) => ({
      name: o.name,
      email: o.email,
      error: o.errors.filter((e) => !e.includes("no resume link")).join("; "),
    }));

  return {
    ok: true,
    cycle,
    notInRound,
    candidates: candidates.length,
    foldersCreated: outcomes.filter((o) => o.created.includes("folder")).length,
    assetsCreated: outcomes.reduce((n, o) => n + o.created.length, 0),
    unchanged: alreadyDone + outcomes.filter((o) => o.created.length === 0 && o.errors.length === 0).length,
    remaining,
    noResume,
    failed,
    outcomes,
  };
}
