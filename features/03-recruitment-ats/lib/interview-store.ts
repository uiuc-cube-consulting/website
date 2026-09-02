// Server-only data access for the interviewer console. Never import from client code.
//
// Three concerns live here:
//   · the board an interviewer sees (candidates + resume pointer + their own rubrics)
//   · writing a rubric, gated on panel membership
//   · syncing resumes from a Drive folder onto applicant rows
//
// Same Supabase-or-demo posture as lib/store.ts: no env -> demo reads, writes report
// demo mode instead of silently succeeding.

import { createServerClient } from "@/lib/supabase/server";
import { DEMO_APPLICANTS, DEMO_FLAGS } from "./demo";
import { fetchFileMeta, listResumeFiles } from "./drive";
import {
  INTERVIEW_KINDS,
  submittedTotal,
  type PanelScore,
  ROUND_KINDS,
  roundOfKind,
  type Candidate,
  type InterviewKind,
  type Recommendation,
  type RubricEntry,
} from "./interview";
import { ROUND_STAGES, type InterviewRound } from "./rounds";
import { parseResumeId } from "./form-resume";
import { readApplicantsFromSheet } from "./import";
import { planResumeMatches, type DriveFileMeta } from "./resume-match";
import { excludeOwnApplications } from "./self-access";
import type { Flag, Stage } from "./types";

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

/** Server-internal: carries the Drive file id, which never leaves this layer. */
export type ResumePointer = {
  fileId: string;
  name: string | null;
  mime: string | null;
  /** How the file was linked — "fuzzy" is worth a second look. */
  match: string | null;
  linkedAt: string | null;
};

export type Board = {
  round: InterviewRound;
  candidates: Candidate[];
  demo: boolean;
  viewer: string;
  canManage: boolean;
};

type ReviewRow = {
  applicant_id: string;
  reviewer_email: string;
  kind: string;
  scores: Record<string, number> | null;
  notes: string | null;
  recommendation: string | null;
  weighted_total: number | null;
  created_at?: string;
};

/** Every kind present, all empty. Kinds outside the active round stay null — the
 *  board never carries another round's scores, which is what keeps a final-round
 *  rubric out of a non-exec response by construction. */
function emptyRubrics(): Record<InterviewKind, RubricEntry | null> {
  return Object.fromEntries(INTERVIEW_KINDS.map((k) => [k, null])) as Record<
    InterviewKind,
    RubricEntry | null
  >;
}

function zeroCounts(): Record<InterviewKind, number> {
  return Object.fromEntries(INTERVIEW_KINDS.map((k) => [k, 0])) as Record<InterviewKind, number>;
}

function toEntry(row: ReviewRow, kind: InterviewKind): RubricEntry {
  return {
    kind,
    scores: row.scores ?? {},
    notes: row.notes ?? "",
    recommendation: (row.recommendation as Recommendation | null) ?? null,
    weighted_total: Number(row.weighted_total ?? 0),
    updated_at: row.created_at,
  };
}

/**
 * Everything one ROUND's console needs, in three parallel queries. Interview
 * cohorts are small (hundreds at most), so we hand the whole set to the client
 * once and let search filter it locally — that makes typing a name feel instant
 * instead of firing a request per keystroke.
 *
 * Every one of those three queries is scoped to `round`, and that is the point:
 *
 *   · candidates — only those whose stage puts them in this round, so the first
 *     round is the people who cleared the written screen rather than the whole
 *     applicant pool.
 *   · panels — this round's panel rows only, so first- and final-round panels are
 *     independent.
 *   · rubrics — only this round's kinds, so a final-round score is not merely
 *     hidden from a first-round response, it is never fetched into it.
 *
 * The route is what refuses a non-exec caller asking for `final_round`; this
 * function assumes that check has already passed and simply builds the board it
 * was asked for.
 */
export async function getBoard(
  viewerEmail: string,
  canManage: boolean,
  round: InterviewRound
): Promise<Board> {
  const viewer = viewerEmail.toLowerCase();
  const stages = ROUND_STAGES[round];
  const kinds = ROUND_KINDS[round];
  const sb = db();

  if (!sb) {
    return {
      round,
      candidates: excludeOwnApplications(
        viewer,
        DEMO_APPLICANTS.filter((a) => stages.includes(a.stage)),
        (a) => a.email
      ).map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        year: a.year,
        major: a.major,
        college: a.college,
        stage: a.stage,
        resume: null,
        panel: [],
        assignedToMe: false,
        myRubrics: emptyRubrics(),
        completed: zeroCounts(),
        flags: DEMO_FLAGS.filter((f) => f.applicant_id === a.id),
      })),
      demo: true,
      viewer,
      canManage,
    };
  }

  const [applicantsRes, panelRes, reviewsRes, flagsRes] = await Promise.all([
    sb
      .from("applicants")
      .select("id, name, email, year, major, college, stage, resume_file_id, resume_name, resume_mime, resume_match, resume_linked_at, drive_folder_url")
      .in("stage", stages as readonly string[])
      .order("name", { ascending: true }),
    sb.from("interview_panel").select("applicant_id, interviewer_email").eq("round", round),
    sb
      .from("reviews")
      .select("applicant_id, reviewer_email, kind, scores, notes, recommendation, weighted_total, created_at")
      .in("kind", kinds as readonly string[]),
    // Only flags already attached to an applicant. A PENDING flag is filed
    // against an email nobody has applied from, so it belongs to no candidate on
    // this board — it is claimed at application time, not matched here.
    sb.from("applicant_flags").select("*").not("applicant_id", "is", null),
  ]);

  if (applicantsRes.error) throw applicantsRes.error;
  if (panelRes.error) throw panelRes.error;
  if (reviewsRes.error) throw reviewsRes.error;
  // A flag that fails to load is a missing annotation, not a broken board — the
  // interview can go ahead without it, so this degrades rather than throws.
  const flagsByApplicant = new Map<string, Flag[]>();
  for (const f of (flagsRes.error ? [] : ((flagsRes.data ?? []) as Flag[]))) {
    if (!f.applicant_id) continue;
    const cur = flagsByApplicant.get(f.applicant_id);
    if (cur) cur.push(f);
    else flagsByApplicant.set(f.applicant_id, [f]);
  }

  const panelByApplicant = new Map<string, string[]>();
  for (const p of panelRes.data ?? []) {
    const email = String(p.interviewer_email).toLowerCase();
    const cur = panelByApplicant.get(p.applicant_id);
    if (cur) cur.push(email);
    else panelByApplicant.set(p.applicant_id, [email]);
  }

  const mine = new Map<string, Record<InterviewKind, RubricEntry | null>>();
  const completed = new Map<string, Record<InterviewKind, number>>();
  // Submitted totals, for the people who run the round. Gated on `canManage` for
  // the same reason `myRubrics` only ever holds your own: a panelist who can see
  // what their co-interviewer scored before writing their own number is no longer
  // giving an independent read. Exec needs the opposite — the whole round in one
  // place — and they are the ones deciding, not scoring blind.
  const panelScores = new Map<string, PanelScore[]>();
  for (const r of (reviewsRes.data ?? []) as ReviewRow[]) {
    const kind = r.kind as InterviewKind;
    if (!kinds.includes(kind)) continue;

    const total = submittedTotal(kind, r.scores ?? {});
    if (total !== null) {
      const c = completed.get(r.applicant_id) ?? zeroCounts();
      c[kind] += 1;
      completed.set(r.applicant_id, c);

      if (canManage) {
        const list = panelScores.get(r.applicant_id) ?? [];
        list.push({
          reviewer: String(r.reviewer_email).toLowerCase(),
          kind,
          total,
          recommendation: (r.recommendation as string | null) ?? null,
        });
        panelScores.set(r.applicant_id, list);
      }
    }
    if (String(r.reviewer_email).toLowerCase() === viewer) {
      const m = mine.get(r.applicant_id) ?? emptyRubrics();
      m[kind] = toEntry(r, kind);
      mine.set(r.applicant_id, m);
    }
  }

  // Your own candidacy is not yours to read (lib/self-access.ts). Dropped HERE,
  // after the panel and rubric joins rather than before them, so the `completed`
  // counts other candidates carry still include reviews you happened to write —
  // filtering earlier would quietly under-count them.
  //
  // This is the UI-level half. `GET /api/recruitment/resume/[id]` enforces the
  // same rule independently, because a candidate id can be guessed whether or
  // not the board ever listed it.
  const visibleApplicants = excludeOwnApplications(
    viewer,
    applicantsRes.data ?? [],
    (a) => a.email as string
  );

  const candidates: Candidate[] = visibleApplicants.map((a) => {
    const panel = panelByApplicant.get(a.id) ?? [];
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      year: a.year ?? undefined,
      major: a.major ?? undefined,
      college: a.college ?? undefined,
      stage: a.stage as Stage,
      driveFolderUrl: a.drive_folder_url ?? null,
      // Deliberately no fileId — the client asks for /api/recruitment/resume/<applicant id>.
      resume: a.resume_file_id
        ? {
            name: a.resume_name ?? null,
            mime: a.resume_mime ?? null,
            match: a.resume_match ?? null,
            linkedAt: a.resume_linked_at ?? null,
          }
        : null,
      panel,
      assignedToMe: panel.includes(viewer),
      myRubrics: mine.get(a.id) ?? emptyRubrics(),
      completed: completed.get(a.id) ?? zeroCounts(),
      panelScores: canManage ? panelScores.get(a.id) ?? [] : undefined,
      flags: flagsByApplicant.get(a.id) ?? [],
    };
  });

  return { round, candidates, demo: false, viewer, canManage };
}

// ── Authorization ────────────────────────────────────────────────────────────

/**
 * Panel membership is the whole access rule for writes: you may fill in a rubric
 * for a candidate you are interviewing, in the round you are interviewing them
 * for, and nothing else. Checked here as well as in the route so a future caller
 * can't skip it.
 *
 * The round is part of the check, not decoration. Sitting a candidate's FIRST
 * round is not authority to write their FINAL-round rubric — that round is exec's
 * — so a first-round panelist posting a `final_case` body is refused here even
 * though they are, in some sense, "on the panel".
 */
export async function isOnPanel(
  applicantId: string,
  email: string,
  round: InterviewRound
): Promise<boolean> {
  const sb = db();
  if (!sb) return false;
  // eq, not ilike: `_` and `%` are LIKE wildcards and both are legal in an email
  // local part. Panel rows are written lowercased, so an exact match is correct.
  const { data, error } = await sb
    .from("interview_panel")
    .select("applicant_id")
    .eq("applicant_id", applicantId)
    .eq("interviewer_email", email.toLowerCase())
    .eq("round", round)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type WriteResult = { ok: boolean; demo?: boolean; error?: string; forbidden?: boolean };

/**
 * Upsert the viewer's own instance of one rubric. Keyed on
 * (applicant_id, reviewer_email, kind), so a second interviewer on the same
 * candidate writes a separate row and the two never overwrite each other — and,
 * because the first and final rounds use different kinds, so does the same
 * interviewer seeing the same candidate twice across the two rounds.
 *
 * The panel check applies to the final round only, and is scoped to the round the
 * KIND belongs to rather than the round the caller claims: the body carries a
 * kind, the round is derived from it, and the two therefore cannot disagree.
 */
export async function saveRubric(input: {
  applicant_id: string;
  reviewer_email: string;
  kind: InterviewKind;
  scores: Record<string, number>;
  notes?: string;
  recommendation?: Recommendation | null;
  /** Exec may correct a rubric without being on the panel. */
  bypassPanel?: boolean;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const round = roundOfKind(input.kind);
  const email = input.reviewer_email.toLowerCase();
  // The panel gates the FINAL round only. In the first round it records who is
  // scheduled to interview whom, and any member may submit a score for any
  // candidate — an interview happens with whoever is actually in the room, and a
  // panel row written the day before should not be what decides whether that
  // conversation can be recorded. The final round keeps the gate because it is a
  // deliberately small room, and `canInterviewInRound` has already limited it to
  // exec before this point.
  if (
    round === "final_round" &&
    !input.bypassPanel &&
    !(await isOnPanel(input.applicant_id, email, round))
  ) {
    return {
      ok: false,
      forbidden: true,
      error: "You are not on this candidate's final-round panel.",
    };
  }

  const { error } = await sb.from("reviews").upsert(
    {
      applicant_id: input.applicant_id,
      reviewer_email: email,
      kind: input.kind,
      scores: input.scores,
      weighted_total: submittedTotal(input.kind, input.scores) ?? 0,
      notes: input.notes ?? null,
      recommendation: input.recommendation ?? null,
    },
    { onConflict: "applicant_id,reviewer_email,kind" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type PanelResult = WriteResult & { panel?: string[] };

/**
 * Exec sets the full panel for one candidate IN ONE ROUND (replacing whoever was
 * on it for that round).
 *
 * Both the delete and the insert are scoped to `round`, so setting a final-round
 * panel leaves the first-round one — and the rubrics it authorized — untouched.
 * Without that scoping, naming the final-round panel would revoke the first-round
 * interviewers' access to rubrics they had already written.
 */
export async function setPanel(input: {
  applicant_id: string;
  interviewer_emails: string[];
  assigned_by: string;
  round: InterviewRound;
}): Promise<PanelResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const emails = [...new Set(input.interviewer_emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];

  const { error: delErr } = await sb
    .from("interview_panel")
    .delete()
    .eq("applicant_id", input.applicant_id)
    .eq("round", input.round);
  if (delErr) return { ok: false, error: delErr.message };

  if (emails.length) {
    const { error } = await sb.from("interview_panel").insert(
      emails.map((interviewer_email) => ({
        applicant_id: input.applicant_id,
        interviewer_email,
        round: input.round,
        assigned_by: input.assigned_by.toLowerCase(),
      }))
    );
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, panel: emails };
}

/** The Drive pointer for one applicant, for the streaming route. */
export async function getResumePointer(applicantId: string): Promise<ResumePointer | null> {
  const sb = db();
  if (!sb) return null;
  const { data, error } = await sb
    .from("applicants")
    .select("resume_file_id, resume_name, resume_mime, resume_match, resume_linked_at")
    .eq("id", applicantId)
    .maybeSingle();
  if (error || !data?.resume_file_id) return null;
  return {
    fileId: data.resume_file_id,
    name: data.resume_name ?? null,
    mime: data.resume_mime ?? null,
    match: data.resume_match ?? null,
    linkedAt: data.resume_linked_at ?? null,
  };
}

// ── Resumes from the Form response ───────────────────────────────────────────

/**
 * Point applicants at the resume their Form response uploaded.
 *
 * This is what makes the resume readable during the WRITTEN round, and it has to
 * be: the written rubric scores the resume out of 5, so a reader who cannot open
 * it cannot honestly fill in the form. Waiting for first-round folder provisioning
 * would mean nobody sees a resume until after the decision that needs it.
 *
 * The Form gives an authoritative candidate -> file mapping, so nothing is guessed
 * here — contrast `syncResumes` below, which matches filenames because resumes
 * used to arrive as a flat folder of arbitrarily named files.
 *
 * Applicants who already have a pointer are left alone. First-round provisioning
 * copies the file into the candidate's own folder and repoints them at the copy,
 * and that copy is the better pointer: it lives in the shared drive the service
 * account owns, so it survives the applicant tidying up their own Drive.
 */
export type FormResumeLink = { applicantId: string; resumeLink?: string | null };

export async function linkFormResumes(
  links: FormResumeLink[]
): Promise<{ linked: number; error?: string }> {
  const sb = db();
  if (!sb || links.length === 0) return { linked: 0 };

  const wanted = links.flatMap((l) => {
    const fileId = parseResumeId(l.resumeLink);
    return fileId ? [{ applicantId: l.applicantId, fileId }] : [];
  });
  if (!wanted.length) return { linked: 0 };

  // Only fill gaps. NOT NULL columns must ride along in an upsert tuple, so the
  // name and email come back with the id.
  const { data: rows, error } = await sb
    .from("applicants")
    .select("id, name, email, resume_file_id")
    .in("id", wanted.map((w) => w.applicantId));
  if (error) return { linked: 0, error: error.message };

  const byId = new Map((rows ?? []).map((r) => [String(r.id), r]));
  const todo = wanted.filter((w) => {
    const row = byId.get(w.applicantId);
    return row && !row.resume_file_id;
  });
  if (!todo.length) return { linked: 0 };

  // One metadata call each, four at a time: enough to hide the latency on a
  // 200-person import, well under Drive's per-user read limits.
  const metas: (Awaited<ReturnType<typeof fetchFileMeta>> | null)[] = new Array(todo.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, todo.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= todo.length) return;
        metas[i] = await fetchFileMeta(todo[i].fileId);
      }
    })
  );

  const now = new Date().toISOString();
  const patches = todo.flatMap((w, i) => {
    const row = byId.get(w.applicantId)!;
    const meta = metas[i];
    // A file we cannot read is a file we cannot stream either, so recording a
    // pointer to it would only turn a visible gap into a broken viewer.
    if (!meta?.ok) return [];
    return [{
      id: row.id,
      name: row.name,
      email: row.email,
      resume_file_id: w.fileId,
      resume_name: meta.name,
      resume_mime: meta.mimeType,
      resume_match: "form", // authoritative — the Form told us, we did not guess
      resume_linked_at: now,
    }];
  });
  if (!patches.length) return { linked: 0 };

  const { error: upErr } = await sb.from("applicants").upsert(patches, { onConflict: "id" });
  if (upErr) return { linked: 0, error: upErr.message };
  return { linked: patches.length };
}

// ── Resume sync ──────────────────────────────────────────────────────────────

export type SyncResult = {
  ok: boolean;
  demo?: boolean;
  error?: string;
  scanned?: number; // files found in the folder
  linked?: number; // applicants that now have a resume
  fuzzy?: number; // linked on a non-exact match — worth spot-checking
  unmatched?: { name: string; reason: "no-match" | "ambiguous" }[];
  missing?: { id: string; name: string; email: string }[]; // applicants still without a resume
};

/**
 * Read the Drive folder, match every file to an applicant, and write the pointers.
 *
 * Idempotent: re-running after adding files to the folder only tops up. One list
 * call, one applicant read, one bulk upsert — the matching itself is in-memory and
 * hash-based (see resume-match.ts), so this stays fast as the folder grows.
 */
export async function syncResumes(folderIdRaw: string): Promise<SyncResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const listed = await listResumeFiles(folderIdRaw);
  if (!listed.ok) return { ok: false, error: listed.error };

  const { data: applicants, error } = await sb.from("applicants").select("id, name, email, resume_file_id");
  if (error) return { ok: false, error: error.message };
  if (!applicants?.length) return { ok: true, scanned: listed.files.length, linked: 0, fuzzy: 0, unmatched: [], missing: [] };

  const plan = planResumeMatches(
    listed.files,
    applicants.map((a) => ({ id: a.id, name: a.name, email: a.email }))
  );

  const byId = new Map(applicants.map((a) => [a.id, a]));
  const now = new Date().toISOString();
  const rows = plan.matched
    .filter((m) => byId.has(m.applicantId))
    .map((m) => {
      const a = byId.get(m.applicantId)!;
      return {
        id: a.id,
        name: a.name, // required NOT NULL columns must be present in the upsert tuple
        email: a.email,
        resume_file_id: m.file.id,
        resume_name: m.file.name,
        resume_mime: m.file.mimeType ?? null,
        resume_match: m.method,
        resume_linked_at: now,
      };
    });

  if (rows.length) {
    const { error: upErr } = await sb.from("applicants").upsert(rows, { onConflict: "id" });
    if (upErr) return { ok: false, error: upErr.message };
  }

  const linkedIds = new Set(rows.map((r) => r.id));
  const unmatched: SyncResult["unmatched"] = [
    ...plan.unmatched.map((f) => ({ name: f.name, reason: "no-match" as const })),
    ...plan.ambiguous.map((a) => ({ name: a.file.name, reason: "ambiguous" as const })),
  ];

  return {
    ok: true,
    scanned: listed.files.length,
    linked: rows.length,
    fuzzy: plan.matched.filter((m) => m.method === "fuzzy").length,
    unmatched,
    // Still resume-less after this run — neither matched now nor linked previously.
    missing: applicants
      .filter((a) => !linkedIds.has(a.id) && !a.resume_file_id)
      .map((a) => ({ id: a.id, name: a.name, email: a.email })),
  };
}

export type { DriveFileMeta };

// ── Backfilling resumes from the response sheet ──────────────────────────────

export type LinkMissingResult = {
  ok: boolean;
  demo?: boolean;
  error?: string;
  /** Applicants in this cycle with no resume when the run started. */
  missing?: number;
  /** Newly pointed at their Form upload. */
  linked?: number;
  /** No row in the sheet for that email — imported from somewhere else. */
  notInSheet?: number;
  /** The sheet cell held nothing a Drive id could be parsed out of. */
  noLink?: number;
  /** Parsed an id, but Drive would not serve the file. */
  unreadable?: number;
};

/**
 * Point every resume-less applicant at the file their Form response uploaded.
 *
 * This exists because `linkFormResumes` only ever runs over the rows an import
 * just CREATED. Anyone already in the table when resume linking was added — or
 * whose Drive call failed transiently that day — stays unlinked forever, with no
 * way to notice except a reviewer opening the candidate and finding nothing.
 * That is not hypothetical: it left 115 of 328 applicants with no resume in the
 * middle of a live cycle, while the links sat unused in the sheet the whole time.
 *
 * Idempotent and safe to run repeatedly: it only ever fills a row whose
 * `resume_file_id` is still null, re-checked immediately before the write, so a
 * concurrent import or a manual fix is never overwritten. A file Drive refuses
 * is counted and skipped rather than recorded — a pointer to something we cannot
 * stream would turn a visible gap into a broken viewer.
 */
export async function linkMissingResumes(
  sheetId: string,
  cycle?: string
): Promise<LinkMissingResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const query = sb.from("applicants").select("id, email").is("resume_file_id", null);
  if (cycle) query.eq("cycle", cycle);
  const { data: missing, error } = await query;
  if (error) return { ok: false, error: error.message };
  if (!missing?.length) return { ok: true, missing: 0, linked: 0, notInSheet: 0, noLink: 0, unreadable: 0 };

  const read = await readApplicantsFromSheet(sheetId);
  if (!read.ok) return { ok: false, error: read.error };

  // First row wins per address, matching the import's own dedupe.
  const linkByEmail = new Map<string, string | undefined>();
  for (const r of read.rows) {
    const key = r.email.trim().toLowerCase();
    if (!linkByEmail.has(key)) linkByEmail.set(key, r.resumeLink);
  }

  let notInSheet = 0;
  let noLink = 0;
  const todo: { applicantId: string; resumeLink: string }[] = [];
  for (const a of missing) {
    const key = String(a.email).trim().toLowerCase();
    if (!linkByEmail.has(key)) { notInSheet++; continue; }
    const cell = linkByEmail.get(key);
    if (!cell || !parseResumeId(cell)) { noLink++; continue; }
    todo.push({ applicantId: String(a.id), resumeLink: cell });
  }

  // Reuses the same routine the import path uses, so a resume linked by a
  // backfill is indistinguishable from one linked at import — same provenance
  // tag, same gap-filling check, same refusal to record an unreadable file.
  const res = await linkFormResumes(todo);
  return {
    ok: true,
    missing: missing.length,
    linked: res.linked,
    notInSheet,
    noLink,
    unreadable: todo.length - res.linked,
    ...(res.error ? { error: res.error } : {}),
  };
}
