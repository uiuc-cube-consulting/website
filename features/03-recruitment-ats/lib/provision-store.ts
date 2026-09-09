// Server-only orchestration: Google Form responses -> per-candidate Drive folders,
// for ONE INTERVIEW ROUND at a time. Imports googleapis (transitively, via
// ./drive-write) — never import from client code.
//
// Folders are an interview artifact, not an application-time one. A folder holds
// the round's rubric sheets — and, in the first round, the resume — and those
// rubrics only mean anything once a candidate is actually being interviewed.
// Provisioning the whole written pool would create hundreds of folders — one per
// applicant, most of them for people who will never reach an interview — each
// with rubric docs nobody opens, at ~5 Drive calls apiece. So a run is scoped to
// candidates whose stage puts them in the round being provisioned (lib/rounds.ts),
// and re-running it after each batch of advancement decisions picks up exactly
// the people who just moved.
//
// Each round gets its own tree, side by side in the recruiting shared drive:
//
//   1st Round Applicants/
//     Jane Doe — jane@illinois.edu/   Resume · Case Rubric · Behavioral Rubric · Notes
//   Final Round Applicants/
//     Jane Doe — jane@illinois.edu/   Final Round Rubric
//
// Two folders for one candidate, deliberately. They hold different rubrics, and
// they are read by different rooms: exec can share the final-round tree with the
// final-round panel without handing over the first-round tree, which is the same
// rule lib/rounds.ts enforces in the portal rather than an exception to it.
//
// Shape of the run, modeled on syncResumes in ./interview-store.ts:
//   1. read the Form's response sheet
//   2. upsert the applicants it names (deduped by email, as the importer does)
//   3. narrow to the ones currently in the round being provisioned
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
import { driveFolderUrl, parseResumeId } from "./form-resume";
import {
  candidateFolderName,
  copyFileName,
  cycleFolderName,
  docTitle,
  resumeFileName,
} from "./folder-naming";
import { notesDocRequests, type RubricDocMeta } from "./rubric-doc";
import { ROUND_STAGES, type InterviewRound } from "./rounds";
import { normalizeCycle } from "./cycle";
import { getActiveCycle } from "./visibility";
import {
  driveWriteClients,
  ensureFolder,
  copyIntoOnce,
  createDoc,
  fileMeta,
  stillExists,
  type Clients,
  type DriveFile,
} from "./drive-write";

/**
 * A rubric sheet, copied per candidate from the club's master file in Drive.
 *
 * Copied rather than generated. The rubric is a document the club writes, revises
 * between cycles and hands to interviewers on paper; the portal's job is to put a
 * copy of THAT in each candidate's folder, not to re-typeset it. Generating them
 * from criteria in code meant the sheet in the folder and the sheet exec actually
 * uses were two documents that had to be kept in agreement by hand — and the copy
 * always lost, because only one of them was the real one.
 *
 * The master ids are configuration, not constants: a new cycle means new masters,
 * and swapping them should not need a deploy.
 *
 * A master must be a Google Doc, not a PDF or an uploaded .docx. The copy is what
 * an interviewer types their scores and notes into, and only a Doc is editable in
 * place — a PDF copy is a read-only picture of a rubric, which is the one thing it
 * must not be. Upload the club's file to the shared drive with
 * `mimeType: application/vnd.google-apps.document` so Drive converts it.
 */
type RubricTemplate = { kind: AssetKind; label: string; env: string };

/**
 * What provisioning a given round means: where its tree lives, which artifacts a
 * candidate folder holds, and which applicant columns point back at it.
 *
 * One table rather than branches through the run, because every one of these has
 * to change together. A final-round folder recorded under the first round's
 * ledger kind would collide with the first-round folder (the ledger is keyed by
 * applicant AND kind), and a final-round folder written to `drive_folder_id`
 * would silently replace the first-round link the board still needs.
 */
type RoundPlan = {
  /** Default top-level folder in the shared drive; `opts.cycle` overrides it. */
  folder: string;
  /** Ledger kind for the candidate's folder itself. */
  folderKind: AssetKind;
  /** Everything this round provisions, folder included. */
  kinds: readonly AssetKind[];
  templates: readonly RubricTemplate[];
  /** `applicants` columns holding this round's folder pointer. */
  columns: { id: string; url: string; at: string };
};

export const ROUND_PLANS: Record<InterviewRound, RoundPlan> = {
  first_round: {
    folder: "1st Round Applicants",
    folderKind: "folder",
    kinds: ["folder", "resume", "case_rubric", "behavioral_rubric", "notes"],
    templates: [
      { kind: "case_rubric", label: "Case Rubric", env: "RECRUITING_CASE_RUBRIC_FILE_ID" },
      { kind: "behavioral_rubric", label: "Behavioral Rubric", env: "RECRUITING_BEHAVIORAL_RUBRIC_FILE_ID" },
    ],
    columns: { id: "drive_folder_id", url: "drive_folder_url", at: "drive_provisioned_at" },
  },
  final_round: {
    folder: "Final Round Applicants",
    folderKind: "final_folder",
    // No resume copy and no notes doc, and neither is an oversight. The resume
    // already sits in the first-round folder and streams into the workspace, so a
    // second copy is a second thing to keep current; and the second-round rubric
    // carries its own "Additional Comments" and "Notes" sections, so a separate
    // notes doc would just split one interviewer's writing across two files.
    kinds: ["final_folder", "final_rubric"],
    templates: [
      { kind: "final_rubric", label: "Final Round Rubric", env: "RECRUITING_FINAL_RUBRIC_FILE_ID" },
    ],
    columns: {
      id: "final_drive_folder_id",
      url: "final_drive_folder_url",
      at: "final_drive_provisioned_at",
    },
  },
};

type TemplateInfo = { id: string; originalName: string | null };

/**
 * Resolve each configured master once per run and confirm it is readable.
 *
 * Once, not per candidate: the metadata is the same for all of them, and asking
 * Drive 102 times for one unchanging answer is 102 chances to hit a rate limit.
 * A master that is configured but unreadable is reported here rather than as the
 * same failure repeated across every candidate in the cohort.
 */
async function resolveTemplates(
  clients: Clients,
  templates: readonly RubricTemplate[],
  wanted: ReadonlySet<AssetKind>
): Promise<{ ok: true; value: Partial<Record<AssetKind, TemplateInfo>> } | { ok: false; error: string }> {
  const out: Partial<Record<AssetKind, TemplateInfo>> = {};
  for (const t of templates) {
    if (!wanted.has(t.kind)) continue;
    const id = (process.env[t.env] || "").trim();
    if (!id) {
      return {
        ok: false,
        error:
          `No ${t.label} master. Set ${t.env} to the Drive file id of the ${t.label} the club ` +
          `hands interviewers, and make sure it lives in the recruiting shared drive.`,
      };
    }
    const meta = await fileMeta(clients, id);
    if (!meta.ok) return { ok: false, error: `${t.label} master (${t.env}): ${meta.error}` };
    out[t.kind] = { id, originalName: meta.value.name || null };
  }
  return { ok: true, value: out };
}

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

/**
 * Every artifact we provision, across all rounds. Mirrors the CHECK in
 * db/drive-folders.sql as amended by db/final-round-folders.sql.
 *
 * Flat rather than nested per round because it is the ledger's vocabulary, and
 * the ledger is one table keyed (applicant_id, kind). Which of these a given run
 * actually creates is ROUND_PLANS' business.
 */
export const ASSET_KINDS = [
  "folder",
  "resume",
  "case_rubric",
  "behavioral_rubric",
  "notes",
  "final_folder",
  "final_rubric",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type ProvisionOptions = {
  /**
   * Which interview round to provision. Defaults to the first.
   *
   * The round decides everything that differs between the two trees — the
   * top-level folder, which candidates are in scope, which rubric masters are
   * copied, and which ledger kinds and applicant columns record the result. See
   * ROUND_PLANS.
   */
  round?: InterviewRound;
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
   * Restrict the run to these artifact kinds. Defaults to all of ASSET_KINDS.
   *
   * Exists because the folder and the rubric docs answer to different schedules.
   * A cohort is advanced to the first round before the interview questions for
   * that cycle are settled, and a rubric doc created now is one every interviewer
   * has to be told to ignore later — the ledger records it as done, so a later
   * full run will NOT replace it. Provisioning `["folder", "resume"]` gets
   * interviewers the resumes immediately and leaves the rubrics to a second run
   * once the case is locked; that run creates only what is still missing.
   *
   * "folder" is implied whichever kinds are asked for — everything else is
   * created inside it.
   */
  kinds?: readonly AssetKind[];
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
      round: InterviewRound;
      cycle: string;
      candidates: number;
      foldersCreated: number;
      assetsCreated: number;
      unchanged: number;
      /** Candidates still needing work after this call. Zero means done. */
      remaining: number;
      /** Respondents skipped because they are not in the round being provisioned
       *  — still in the written pool, in another round, or already past
       *  interviews. Not an error. */
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
  /** This ROUND's folder id, read from the column ROUND_PLANS names. */
  folderId?: string | null;
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

/**
 * Name the migration when Postgres rejects a write for a reason a pending
 * migration explains.
 *
 * Worth the special case because the failure lands at the worst possible moment:
 * the Drive work has already happened, so the exec sees fifty folders appear and
 * an error saying nothing was recorded. The raw Postgres text ("violates check
 * constraint", "column ... does not exist") does not say which SQL file to run,
 * and these migrations are applied by hand in the Supabase editor.
 */
function migrationHint(message: string, round: InterviewRound): string {
  if (round !== "final_round") return "";
  const columns = ROUND_PLANS.final_round.columns;
  const missing =
    /kind_check|check constraint/i.test(message) ||
    Object.values(columns).some((c) => message.includes(c)) ||
    /column .* does not exist|schema cache/i.test(message);
  return missing
    ? " — run db/final-round-folders.sql in the Supabase SQL editor, then re-run this. " +
      "The Drive folders already exist, so the re-run only records them."
    : "";
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
  const round: InterviewRound = opts.round ?? "first_round";
  const plan = ROUND_PLANS[round];
  const cycle = cycleFolderName(opts.cycle || plan.folder);

  // Kinds are intersected with the round's plan, not merely defaulted from it: a
  // caller asking for ["notes"] in the final round is asking for something that
  // round does not have, and creating it anyway would put a stray doc in the tree.
  // The folder itself is never optional — it is the parent of everything else,
  // and the applicant row points at it.
  const asked = opts.kinds?.length ? new Set<AssetKind>(opts.kinds) : null;
  const wanted = new Set<AssetKind>(plan.kinds.filter((k) => !asked || asked.has(k)));
  wanted.add(plan.folderKind);

  // ── 1. Read the Form responses ─────────────────────────────────────────────
  const sheet = await readApplicantsFromSheet(sheetId, range);
  if (!sheet.ok) return { ok: false, error: sheet.error };
  if (!sheet.rows.length) {
    return {
      ok: true, round, cycle, candidates: 0, foldersCreated: 0, assetsCreated: 0,
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
  // Only THIS round's folder column is selected. The final round's columns arrive
  // with db/final-round-folders.sql, and that migration is run by hand; asking for
  // them unconditionally would take the working first-round run down until it had
  // been applied.
  //
  // Spelled out per round rather than interpolated because supabase-js parses the
  // select list in the TYPE system: a template literal erases the row type and
  // every field read off the result becomes an error.
  const COLUMNS = "id, name, email, year, major, college, stage";
  const { data: applicantRows, error: aErr } =
    round === "final_round"
      ? await sb.from("applicants").select(`${COLUMNS}, final_drive_folder_id`).eq("cycle", cycleKey)
      : await sb.from("applicants").select(`${COLUMNS}, drive_folder_id`).eq("cycle", cycleKey);
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
    const row = a as Record<string, unknown>;
    return [{
      ...a,
      id: String(a.id),
      name: String(a.name),
      email: String(a.email),
      folderId: (row[plan.columns.id] as string | null | undefined) ?? null,
      resumeLink: resumeLinkByEmail.get(e),
    } satisfies Candidate];
  });

  if (!respondents.length) return { ok: false, error: "No applicants matched the sheet rows." };

  // The whole point of the round scoping: only people actually being interviewed
  // in THIS round get a folder in it. Everyone else in the sheet is still being
  // read in the written round, sitting in the other interview round, or already
  // past both.
  const stages = ROUND_STAGES[round] as readonly string[];
  const candidates = respondents.filter((c) => stages.includes(String(c.stage ?? "")));
  const notInRound = respondents.length - candidates.length;

  if (!candidates.length) {
    return {
      ok: true, round, cycle, candidates: 0, foldersCreated: 0, assetsCreated: 0,
      unchanged: 0, remaining: 0, notInRound, noResume: [], failed: [], outcomes: [],
    };
  }

  // ── 3. Cycle folder ────────────────────────────────────────────────────────
  const cycleFolder = await ensureFolder(clients, cycle, rootFolderId);
  if (!cycleFolder.ok) return { ok: false, error: cycleFolder.error };

  const templates = await resolveTemplates(clients, plan.templates, wanted);
  if (!templates.ok) return { ok: false, error: templates.error };

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
   *
   * Judged against `wanted`, not against every kind. A run scoped to folders and
   * resumes must be able to finish: measuring it by the rubric docs it was told
   * not to create would leave every candidate pending, `remaining` would never
   * reach zero, and the console's keep-calling-until-done loop would spin through
   * all 50 of its passes creating nothing.
   *
   * "Provisioned" is also not quite the same question as "linked". The ledger
   * records what exists in Drive; the board clicks through `plan.columns.id` on
   * the applicant row, and those are two writes in step 6 with no transaction
   * around them. If the ledger upsert lands and the applicant upsert fails, the
   * candidate has a folder nobody can reach — and judging completeness by the
   * ledger alone would mark them done forever, so every later run reports them
   * "unchanged" and the link never appears. Requiring the row to agree with the
   * ledger puts them back in `pending`, where 5a re-points the row for the price
   * of no Drive calls at all.
   */
  const isComplete = (c: Candidate): boolean => {
    const have = ledger.get(c.id);
    if (!have) return false;
    if (c.folderId !== have.get(plan.folderKind)?.file_id) return false;
    for (const k of plan.kinds) {
      if (!wanted.has(k)) continue;
      // A candidate who never uploaded a resume cannot be waiting on one.
      if (k === "resume" && !parseResumeId(c.resumeLink)) continue;
      if (!have.has(k)) return false;
    }
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

    // 5a. The candidate's own folder, inside THIS round's tree.
    let folder: DriveFile;
    const folderRow = await existing(plan.folderKind);
    if (folderRow) {
      // Derived from the id rather than read straight off `web_link`, which is
      // nullable: an empty string here would satisfy the id check below and then
      // be written to the applicant row as the folder's URL, leaving the board
      // with a candidate it believes is linked and a link it cannot render. A
      // folder's URL is a pure function of its id, so there is nothing to trust.
      folder = { id: folderRow.file_id, name: "", url: folderRow.web_link || driveFolderUrl(folderRow.file_id) };
      out.skipped.push(plan.folderKind);
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
      newLedger.push({ applicant_id: c.id, kind: plan.folderKind, file_id: folder.id, web_link: folder.url });
      out.created.push(plan.folderKind);
    }
    out.folderUrl = folder.url;

    if (c.folderId !== folder.id) {
      applicantPatches.push({
        id: c.id,
        name: c.name, // NOT NULL columns must be present in an upsert tuple
        email: c.email,
        [plan.columns.id]: folder.id,
        [plan.columns.url]: folder.url,
        [plan.columns.at]: new Date().toISOString(),
      });
    }

    // 5b. The resume, copied out of the Form's upload folder.
    const resumeRow = wanted.has("resume") ? await existing("resume") : null;
    if (!wanted.has("resume")) {
      /* not part of this run */
    } else if (resumeRow) {
      out.skipped.push("resume");
    } else {
      const sourceId = parseResumeId(c.resumeLink);
      if (!sourceId) {
        // Not an error — plenty of rows legitimately have no upload yet.
        out.errors.push("no resume link in the Form response");
      } else {
        const meta = await fileMeta(clients, sourceId);
        const original = meta.ok ? meta.value.name : null;
        const copied = await copyIntoOnce(
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

    // 5c. This round's rubric sheets, each a copy of the club's master file.
    for (const t of plan.templates) {
      if (!wanted.has(t.kind)) continue;
      if (await existing(t.kind)) {
        out.skipped.push(t.kind);
        continue;
      }
      const template = templates.value[t.kind];
      if (!template) continue; // unreachable: resolveTemplates fails the run first
      const copied = await copyIntoOnce(
        clients,
        template.id,
        folder.id,
        copyFileName(t.label, c.name, template.originalName)
      );
      if (!copied.ok) {
        out.errors.push(copied.error);
        continue;
      }
      newLedger.push({ applicant_id: c.id, kind: t.kind, file_id: copied.value.id, web_link: copied.value.url });
      out.created.push(t.kind);
    }

    // 5d. The notes doc, which has no master — it is a blank page by design.
    if (wanted.has("notes") && !(await existing("notes"))) {
      const meta: RubricDocMeta = {
        candidateName: c.name,
        candidateEmail: c.email,
        subtitle: subtitleFor(c),
        label: "Notes",
      };
      const made = await createDoc(
        clients,
        docTitle("Interview Notes", c.name),
        folder.id,
        notesDocRequests(meta)
      );
      if (!made.ok) out.errors.push(made.error);
      else {
        newLedger.push({ applicant_id: c.id, kind: "notes", file_id: made.value.id, web_link: made.value.url });
        out.created.push("notes");
      }
    } else if (wanted.has("notes")) {
      out.skipped.push("notes");
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
      return {
        ok: false,
        error:
          `Drive artifacts were created but recording them failed: ${error.message}` +
          migrationHint(error.message, round),
      };
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
    if (error) {
      return { ok: false, error: `Could not update applicants: ${error.message}` + migrationHint(error.message, round) };
    }
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
    round,
    cycle,
    notInRound,
    candidates: candidates.length,
    foldersCreated: outcomes.filter((o) => o.created.includes(plan.folderKind)).length,
    assetsCreated: outcomes.reduce((n, o) => n + o.created.length, 0),
    unchanged: alreadyDone + outcomes.filter((o) => o.created.length === 0 && o.errors.length === 0).length,
    remaining,
    noResume,
    failed,
    outcomes,
  };
}
