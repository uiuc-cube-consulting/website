// Server-only data access for the ATS. Uses Supabase when configured, otherwise
// falls back to demo data for reads (and reports demo mode for writes). Never import
// from client code.

import { createServerClient } from "@/lib/supabase/server";
import { DEMO_APPLICANTS, DEMO_FLAGS, DEMO_REVIEWS } from "./demo";
import {
  planAssignments,
  weightedTotal,
  type Applicant,
  type Assignment,
  type Flag,
  type Review,
  type Scores,
  type Stage,
} from "./types";

// Members who can be assigned as recruitment reviewers (matches proxy.ts).
// Canonical list lives in ./access.ts so the gate and the pool can never diverge.
import { RECRUITING_ROLES } from "./access";
import {
  computeCoverage,
  validateReassignment,
  MIN_REVIEWERS_PER_APPLICANT,
  type Coverage,
  type ReassignInput,
} from "./assignment";
const REVIEWER_ROLES = [...RECRUITING_ROLES];
// Applicant stages that no longer need review.
const TERMINAL_STAGES = ["rejected", "withdrawn", "accepted"];

// Reuses the shared Supabase client from the strike_system foundation
// (lib/supabase/server.ts) — we do NOT define our own client. Returns null when
// Supabase env is absent → the ATS runs on demo data.
function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

export type Snapshot = { applicants: Applicant[]; reviews: Review[]; flags: Flag[]; demo: boolean };

export async function getSnapshot(): Promise<Snapshot> {
  const sb = db();
  if (!sb) return { applicants: DEMO_APPLICANTS, reviews: DEMO_REVIEWS, flags: DEMO_FLAGS, demo: true };

  const [{ data: applicants, error: aErr }, { data: reviews, error: rErr }, { data: flags, error: fErr }] =
    await Promise.all([
      sb.from("applicants").select("*").order("created_at", { ascending: false }),
      sb.from("reviews").select("*"),
      sb.from("applicant_flags").select("*").order("created_at", { ascending: false }),
    ]);
  if (aErr) throw aErr;
  if (rErr) throw rErr;
  if (fErr) throw fErr;
  return {
    applicants: (applicants ?? []) as Applicant[],
    reviews: (reviews ?? []) as Review[],
    flags: (flags ?? []) as Flag[],
    demo: false,
  };
}

export type WriteResult = { ok: boolean; demo?: boolean; id?: string; error?: string };

export async function createApplicant(input: {
  name: string;
  email: string;
  year?: string;
  major?: string;
  college?: string;
  responses?: Record<string, string>;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };
  const { data, error } = await sb
    .from("applicants")
    .insert({
      name: input.name,
      email: input.email,
      year: input.year ?? null,
      major: input.major ?? null,
      college: input.college ?? null,
      responses: input.responses ?? {},
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id };
}

export async function submitReview(input: {
  applicant_id: string;
  reviewer_email: string;
  scores: Scores;
  notes?: string;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };
  // `kind` is part of the conflict target, not decoration. db/interview.sql
  // DROPPED the original unique (applicant_id, reviewer_email) and replaced it
  // with (applicant_id, reviewer_email, kind), so a reviewer's case rubric cannot
  // overwrite their screen. Upserting on the old pair therefore names a
  // constraint that no longer exists, and Postgres rejects the whole statement
  // with "no unique or exclusion constraint matching the ON CONFLICT
  // specification" — which surfaced as every screen review failing to save.
  const { error } = await sb.from("reviews").upsert(
    {
      applicant_id: input.applicant_id,
      reviewer_email: input.reviewer_email,
      kind: "screen",
      scores: input.scores,
      weighted_total: weightedTotal(input.scores),
      notes: input.notes ?? null,
    },
    { onConflict: "applicant_id,reviewer_email,kind" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitFlag(input: {
  applicant_id: string;
  submitter_email: string;
  color: "red" | "green";
  description: string;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };
  const { error } = await sb.from("applicant_flags").insert({
    applicant_id: input.applicant_id,
    submitter_email: input.submitter_email,
    color: input.color,
    description: input.description,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setDecision(input: {
  applicant_id: string;
  stage: Stage;
  decided_by: string;
  note?: string;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };
  const { error: uErr } = await sb.from("applicants").update({ stage: input.stage }).eq("id", input.applicant_id);
  if (uErr) return { ok: false, error: uErr.message };
  const { error: dErr } = await sb.from("decisions").upsert(
    {
      applicant_id: input.applicant_id,
      decision: input.stage,
      decided_by: input.decided_by,
      note: input.note ?? null,
    },
    { onConflict: "applicant_id" }
  );
  if (dErr) return { ok: false, error: dErr.message };
  return { ok: true };
}

// ── Reviewer pool, assignments, queue ────────────────────────────────────────

export type Reviewer = { email: string; name?: string | null };

/** The reviewer pool = members whose role can review applicants. */
export async function getReviewerPool(): Promise<Reviewer[]> {
  const sb = db();
  if (!sb) {
    // demo: distinct reviewers seen in the demo reviews
    const seen = new Map<string, Reviewer>();
    for (const r of DEMO_REVIEWS) seen.set(r.reviewer_email, { email: r.reviewer_email });
    return [...seen.values()];
  }
  const { data, error } = await sb.from("members").select("email, full_name, role").in("role", REVIEWER_ROLES);
  if (error) throw error;
  return (data ?? []).map((m) => ({ email: m.email, name: m.full_name }));
}

export async function getAssignments(): Promise<Assignment[]> {
  const sb = db();
  if (!sb) return [];
  const { data, error } = await sb.from("assignments").select("applicant_id, reviewer_email");
  if (error) throw error;
  return (data ?? []) as Assignment[];
}

export type AssignResult = {
  ok: boolean;
  demo?: boolean;
  error?: string;
  assigned?: number; // new assignment rows created
  applicants?: number; // active applicants considered
  reviewers?: number; // reviewer pool size
};

/** Randomly + evenly assign k reviewers to every active applicant (top-up aware). */
export async function assignReviewers(k = 2): Promise<AssignResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const { data: apps, error: aErr } = await sb.from("applicants").select("id, email, stage");
  if (aErr) return { ok: false, error: aErr.message };
  const active = (apps ?? []).filter((a) => !TERMINAL_STAGES.includes(a.stage));

  const pool = await getReviewerPool();
  const reviewerEmails = pool.map((p) => p.email);
  if (reviewerEmails.length === 0) {
    return { ok: false, error: "No reviewers found. Seed members with a reviewer role first." };
  }

  const existing = await getAssignments();
  const plan = planAssignments(
    active.map((a) => ({ id: a.id, email: a.email })),
    reviewerEmails,
    existing,
    k
  );

  if (plan.length) {
    const { error } = await sb.from("assignments").upsert(plan, { onConflict: "applicant_id,reviewer_email" });
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, assigned: plan.length, applicants: active.length, reviewers: reviewerEmails.length };
}

// ── Bulk import (from a Google Sheet of form responses) ──────────────────────

export type ImportRow = {
  name: string;
  email: string;
  year?: string;
  major?: string;
  college?: string;
  responses?: Record<string, string>;
  /** Raw contents of the Form's file-upload column, when the sheet has one.
   *  Parsed into a Drive file id by lib/form-resume.ts during provisioning. */
  resumeLink?: string;
};

export type ImportResult = { ok: boolean; demo?: boolean; error?: string; inserted?: number; skipped?: number };

/** Insert applicants, deduped by email (existing + within the batch). */
export async function importApplicants(rows: ImportRow[]): Promise<ImportResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const { data: existing, error: eErr } = await sb.from("applicants").select("email");
  if (eErr) return { ok: false, error: eErr.message };
  const have = new Set((existing ?? []).map((e) => String(e.email).toLowerCase()));

  const seen = new Set<string>();
  const toInsert = rows
    .filter((r) => r.email && /.+@.+\..+/.test(r.email))
    .filter((r) => {
      const key = r.email.toLowerCase();
      if (have.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      name: r.name || r.email,
      email: r.email,
      year: r.year ?? null,
      major: r.major ?? null,
      college: r.college ?? null,
      responses: r.responses ?? {},
    }));

  if (toInsert.length) {
    const { error } = await sb.from("applicants").insert(toInsert);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

// ── Coverage + manual reassignment (exec) ────────────────────────────────────

export type CoverageResult =
  | { ok: true; demo?: boolean; rows: Coverage[] }
  | { ok: false; error: string };

/**
 * Live reviewer coverage for every ACTIVE applicant. Computed from the tables
 * rather than inferred from the last assignment run, because the two drift the
 * moment an applicant arrives late or a reviewer goes quiet.
 */
export async function getCoverage(): Promise<CoverageResult> {
  const sb = db();
  if (!sb) return { ok: true, demo: true, rows: [] };

  const [appsRes, assignsRes, reviewsRes] = await Promise.all([
    sb.from("applicants").select("id, name, email, stage"),
    sb.from("assignments").select("applicant_id, reviewer_email"),
    sb.from("reviews").select("applicant_id, reviewer_email, kind"),
  ]);
  if (appsRes.error) return { ok: false, error: appsRes.error.message };
  if (assignsRes.error) return { ok: false, error: assignsRes.error.message };
  if (reviewsRes.error) return { ok: false, error: reviewsRes.error.message };

  const active = (appsRes.data ?? []).filter((a) => !TERMINAL_STAGES.includes(a.stage));
  return {
    ok: true,
    rows: computeCoverage(
      active as { id: string; name: string; email: string; stage: string }[],
      (assignsRes.data ?? []) as Assignment[],
      (reviewsRes.data ?? []) as unknown as Review[]
    ),
  };
}

export type ReassignResult =
  | { ok: true; assigned: string[] }
  | { ok: false; demo: true }
  | { ok: false; error: string };

/**
 * Exec reroutes a single candidate's reviewers: add, remove, or swap one out for
 * another. This is the delibs-day escape hatch — someone is absent, and the
 * candidate needs an eye on them now.
 *
 * Validation is shared with the client (lib/assignment.ts) so the UI refuses the
 * same things the API does, but it is re-run here against freshly read state:
 * the browser's copy of who is assigned can be minutes stale, and two execs
 * rerouting at once would otherwise race.
 */
export async function reassignReviewer(input: ReassignInput): Promise<ReassignResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const { data: applicant, error: aErr } = await sb
    .from("applicants")
    .select("id, email")
    .eq("id", input.applicant_id)
    .single();
  if (aErr || !applicant) return { ok: false, error: "Unknown applicant." };

  const { data: current, error: cErr } = await sb
    .from("assignments")
    .select("reviewer_email")
    .eq("applicant_id", input.applicant_id);
  if (cErr) return { ok: false, error: cErr.message };
  const assignees = (current ?? []).map((r) => String(r.reviewer_email));

  const pool = (await getReviewerPool()).map((p) => p.email);
  const check = validateReassignment(input, applicant as { id: string; email: string }, assignees, pool);
  if (!check.ok) return { ok: false, error: check.error };

  const to = input.to?.toLowerCase();
  const from = input.from?.toLowerCase();

  if (input.action === "remove" || input.action === "swap") {
    const { error } = await sb
      .from("assignments")
      .delete()
      .eq("applicant_id", input.applicant_id)
      .ilike("reviewer_email", from!);
    if (error) return { ok: false, error: error.message };
  }
  if (input.action === "add" || input.action === "swap") {
    const { error } = await sb
      .from("assignments")
      .upsert(
        { applicant_id: input.applicant_id, reviewer_email: to! },
        { onConflict: "applicant_id,reviewer_email" }
      );
    if (error) return { ok: false, error: error.message };
  }

  const { data: after } = await sb
    .from("assignments")
    .select("reviewer_email")
    .eq("applicant_id", input.applicant_id);
  return { ok: true, assigned: (after ?? []).map((r) => String(r.reviewer_email)).sort() };
}

export { MIN_REVIEWERS_PER_APPLICANT };
