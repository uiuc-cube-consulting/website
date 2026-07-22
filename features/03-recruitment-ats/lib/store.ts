// Server-only data access for the ATS. Uses Supabase when configured, otherwise
// falls back to demo data for reads (and reports demo mode for writes). Never import
// from client code.

import { createServerClient } from "@/lib/supabase/server";
import { DEMO_APPLICANTS, DEMO_REVIEWS } from "./demo";
import {
  planAssignments,
  weightedTotal,
  type Applicant,
  type Assignment,
  type Review,
  type Scores,
  type Stage,
} from "./types";

// Members who can be assigned as recruitment reviewers (matches proxy.ts).
const REVIEWER_ROLES = ["exec", "project_manager", "senior_consultant", "returning_member"];
// Applicant stages that no longer need review.
const TERMINAL_STAGES = ["rejected", "withdrawn", "accepted"];

// Reuses the shared Supabase client from the strike_system foundation
// (lib/supabase/server.ts) — we do NOT define our own client. Returns null when
// Supabase env is absent → the ATS runs on demo data.
function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

export type Snapshot = { applicants: Applicant[]; reviews: Review[]; demo: boolean };

export async function getSnapshot(): Promise<Snapshot> {
  const sb = db();
  if (!sb) return { applicants: DEMO_APPLICANTS, reviews: DEMO_REVIEWS, demo: true };

  const [{ data: applicants, error: aErr }, { data: reviews, error: rErr }] = await Promise.all([
    sb.from("applicants").select("*").order("created_at", { ascending: false }),
    sb.from("reviews").select("*"),
  ]);
  if (aErr) throw aErr;
  if (rErr) throw rErr;
  return {
    applicants: (applicants ?? []) as Applicant[],
    reviews: (reviews ?? []) as Review[],
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
  const { error } = await sb.from("reviews").upsert(
    {
      applicant_id: input.applicant_id,
      reviewer_email: input.reviewer_email,
      scores: input.scores,
      weighted_total: weightedTotal(input.scores),
      notes: input.notes ?? null,
    },
    { onConflict: "applicant_id,reviewer_email" }
  );
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
