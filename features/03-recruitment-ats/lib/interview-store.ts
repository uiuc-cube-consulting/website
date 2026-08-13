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
import { DEMO_APPLICANTS } from "./demo";
import { listResumeFiles } from "./drive";
import {
  INTERVIEW_RUBRICS,
  isComplete,
  type Candidate,
  type InterviewKind,
  type Recommendation,
  type RubricEntry,
} from "./interview";
import { planResumeMatches, type DriveFileMeta } from "./resume-match";
import { weightedTotalFor, type Stage } from "./types";

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

function emptyRubrics(): Record<InterviewKind, RubricEntry | null> {
  return { case: null, behavioral: null };
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
 * Everything the console needs, in three parallel queries. Interview cohorts are
 * small (hundreds at most), so we hand the whole set to the client once and let
 * search filter it locally — that makes typing a name feel instant instead of
 * firing a request per keystroke.
 */
export async function getBoard(viewerEmail: string, canManage: boolean): Promise<Board> {
  const viewer = viewerEmail.toLowerCase();
  const sb = db();

  if (!sb) {
    return {
      candidates: DEMO_APPLICANTS.map((a) => ({
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
        completed: { case: 0, behavioral: 0 },
      })),
      demo: true,
      viewer,
      canManage,
    };
  }

  const [applicantsRes, panelRes, reviewsRes] = await Promise.all([
    sb
      .from("applicants")
      .select("id, name, email, year, major, college, stage, resume_file_id, resume_name, resume_mime, resume_match, resume_linked_at")
      .order("name", { ascending: true }),
    sb.from("interview_panel").select("applicant_id, interviewer_email"),
    sb
      .from("reviews")
      .select("applicant_id, reviewer_email, kind, scores, notes, recommendation, weighted_total, created_at")
      .in("kind", ["case", "behavioral"]),
  ]);

  if (applicantsRes.error) throw applicantsRes.error;
  if (panelRes.error) throw panelRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  const panelByApplicant = new Map<string, string[]>();
  for (const p of panelRes.data ?? []) {
    const email = String(p.interviewer_email).toLowerCase();
    const cur = panelByApplicant.get(p.applicant_id);
    if (cur) cur.push(email);
    else panelByApplicant.set(p.applicant_id, [email]);
  }

  const mine = new Map<string, Record<InterviewKind, RubricEntry | null>>();
  const completed = new Map<string, Record<InterviewKind, number>>();
  for (const r of (reviewsRes.data ?? []) as ReviewRow[]) {
    const kind = r.kind as InterviewKind;
    if (kind !== "case" && kind !== "behavioral") continue;

    if (isComplete(kind, r.scores ?? {})) {
      const c = completed.get(r.applicant_id) ?? { case: 0, behavioral: 0 };
      c[kind] += 1;
      completed.set(r.applicant_id, c);
    }
    if (String(r.reviewer_email).toLowerCase() === viewer) {
      const m = mine.get(r.applicant_id) ?? emptyRubrics();
      m[kind] = toEntry(r, kind);
      mine.set(r.applicant_id, m);
    }
  }

  const candidates: Candidate[] = (applicantsRes.data ?? []).map((a) => {
    const panel = panelByApplicant.get(a.id) ?? [];
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      year: a.year ?? undefined,
      major: a.major ?? undefined,
      college: a.college ?? undefined,
      stage: a.stage as Stage,
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
      completed: completed.get(a.id) ?? { case: 0, behavioral: 0 },
    };
  });

  return { candidates, demo: false, viewer, canManage };
}

// ── Authorization ────────────────────────────────────────────────────────────

/**
 * Panel membership is the whole access rule for writes: you may fill in a rubric
 * for a candidate you are interviewing, and no one else. Checked here as well as
 * in the route so a future caller can't skip it.
 */
export async function isOnPanel(applicantId: string, email: string): Promise<boolean> {
  const sb = db();
  if (!sb) return false;
  // eq, not ilike: `_` and `%` are LIKE wildcards and both are legal in an email
  // local part. Panel rows are written lowercased, so an exact match is correct.
  const { data, error } = await sb
    .from("interview_panel")
    .select("applicant_id")
    .eq("applicant_id", applicantId)
    .eq("interviewer_email", email.toLowerCase())
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type WriteResult = { ok: boolean; demo?: boolean; error?: string; forbidden?: boolean };

/**
 * Upsert the viewer's own instance of one rubric. Keyed on
 * (applicant_id, reviewer_email, kind), so a second interviewer on the same
 * candidate writes a separate row and the two never overwrite each other.
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

  const email = input.reviewer_email.toLowerCase();
  if (!input.bypassPanel && !(await isOnPanel(input.applicant_id, email))) {
    return { ok: false, forbidden: true, error: "You are not on this candidate's interview panel." };
  }

  const { error } = await sb.from("reviews").upsert(
    {
      applicant_id: input.applicant_id,
      reviewer_email: email,
      kind: input.kind,
      scores: input.scores,
      weighted_total: weightedTotalFor(INTERVIEW_RUBRICS[input.kind], input.scores),
      notes: input.notes ?? null,
      recommendation: input.recommendation ?? null,
    },
    { onConflict: "applicant_id,reviewer_email,kind" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type PanelResult = WriteResult & { panel?: string[] };

/** Exec sets the full panel for one candidate (replaces whoever was there). */
export async function setPanel(input: {
  applicant_id: string;
  interviewer_emails: string[];
  assigned_by: string;
}): Promise<PanelResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const emails = [...new Set(input.interviewer_emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];

  const { error: delErr } = await sb.from("interview_panel").delete().eq("applicant_id", input.applicant_id);
  if (delErr) return { ok: false, error: delErr.message };

  if (emails.length) {
    const { error } = await sb.from("interview_panel").insert(
      emails.map((interviewer_email) => ({
        applicant_id: input.applicant_id,
        interviewer_email,
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
