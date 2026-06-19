// Server-only data access for the ATS. Uses Supabase when configured, otherwise
// falls back to demo data for reads (and reports demo mode for writes). Never import
// from client code.

import { supabaseAdmin } from "./supabase";
import { DEMO_APPLICANTS, DEMO_REVIEWS } from "./demo";
import { weightedTotal, type Applicant, type Review, type Scores, type Stage } from "./types";

export type Snapshot = { applicants: Applicant[]; reviews: Review[]; demo: boolean };

export async function getSnapshot(): Promise<Snapshot> {
  const sb = supabaseAdmin();
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
  const sb = supabaseAdmin();
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
  const sb = supabaseAdmin();
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
  const sb = supabaseAdmin();
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
