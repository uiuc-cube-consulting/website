// Server-only persistence for the alumni directory (db/schema.sql in this
// feature). Never import from client code: rows carry phone numbers.
//
// The table is created by SQL someone runs by hand, so the live database can be
// behind this code. A missing table comes back as `missing: true` so the page
// can say "not set up yet" instead of throwing.

import { createServerClient } from "@/lib/supabase/server";
import type { Alumnus, AlumnusInput } from "./alumni";

export type StoreFailure = { ok: false; missing: boolean; conflict?: boolean; error: string };
export type ListResult = { ok: true; rows: Alumnus[] } | StoreFailure;
export type RowResult = { ok: true; row: Alumnus } | StoreFailure;

const COLUMNS =
  "id, full_name, linkedin_url, headline, company, position, major, email, phone, " +
  "campus_status, open_to_mentor, source, updated_at";

// PGRST205: table not in the schema cache. 42P01: undefined table.
const MISSING_CODES = new Set(["PGRST205", "42P01"]);

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

const NOT_CONFIGURED: StoreFailure = {
  ok: false,
  missing: false,
  error: "Supabase isn't configured on this deployment.",
};

function failure(error: { code?: string; message: string } | null): StoreFailure {
  return {
    ok: false,
    missing: Boolean(error?.code && MISSING_CODES.has(error.code)),
    // 23505: unique_violation, which here can only be linkedin_url.
    conflict: error?.code === "23505",
    error: error?.code === "23505" ? "Someone with that LinkedIn profile is already in the directory." : error?.message ?? "Unknown database error.",
  };
}

export async function listAlumni(): Promise<ListResult> {
  const supabase = db();
  if (!supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.from("alumni").select(COLUMNS).order("full_name");
  if (error) return failure(error);
  return { ok: true, rows: (data ?? []) as unknown as Alumnus[] };
}

export async function createAlumnus(input: AlumnusInput, editorId: string): Promise<RowResult> {
  const supabase = db();
  if (!supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase
    .from("alumni")
    .insert({ ...input, source: "manual", updated_by: editorId })
    .select(COLUMNS)
    .single();
  if (error) return failure(error);
  return { ok: true, row: data as unknown as Alumnus };
}

export async function updateAlumnus(id: string, input: AlumnusInput, editorId: string): Promise<RowResult | null> {
  const supabase = db();
  if (!supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase
    .from("alumni")
    .update({ ...input, updated_by: editorId, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return failure(error);
  return data ? { ok: true, row: data as unknown as Alumnus } : null;
}

/** Returns false when there was no such row. */
export async function deleteAlumnus(id: string): Promise<{ ok: true; deleted: boolean } | StoreFailure> {
  const supabase = db();
  if (!supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.from("alumni").delete().eq("id", id).select("id");
  if (error) return failure(error);
  return { ok: true, deleted: (data ?? []).length > 0 };
}
