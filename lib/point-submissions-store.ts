// Server-only persistence for point submissions (db/point-submissions.sql).
// Never import from client code.
//
// The table, bucket and review function are created by SQL someone runs by
// hand, so the live database can be behind this code. Every call reports a
// missing table or bucket as `missing: true` so routes can say "not set up
// yet" instead of failing with a Postgres error.

import { randomUUID } from "crypto";
import { createServerClient } from "@/lib/supabase/server";
import {
  emptyCategoryTotals,
  type CategoryTotals,
  type PointCategory,
  type SubmissionRow,
  type SubmissionStatus,
} from "@/lib/point-catalog";
import { extensionFor, type Evidence } from "@/lib/point-evidence";
import { categoryTotals, type PointEntry } from "@/lib/points";

/** PRIVATE bucket. Photos are only ever served through the evidence route. */
export const EVIDENCE_BUCKET = "point-evidence";

/** Both null when the member submitted without a photo. */
export type SubmissionWithEvidence = SubmissionRow & { evidence_path: string | null; evidence_mime: string | null };

/**
 * `outdated`: the table exists but predates a migration this call needs, e.g. a
 * photo-less submission before db/point-submissions-optional-photo.sql has run.
 */
export type StoreFailure = { ok: false; missing: boolean; outdated?: boolean; error: string };
export type ListResult = { ok: true; rows: SubmissionRow[] } | StoreFailure;
export type CreateResult = { ok: true; row: SubmissionRow } | StoreFailure;
/** `outcome` is what review_point_submission returned, e.g. 'approved' or 'already_rejected'. */
export type ReviewResult = { ok: true; outcome: string } | StoreFailure;

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

const NOT_CONFIGURED: StoreFailure = {
  ok: false,
  missing: false,
  error: "Supabase isn't configured on this deployment.",
};

// PGRST205: table not in the schema cache. PGRST202: function not found.
// 42P01: undefined table, when the query reaches Postgres itself.
const MISSING_CODES = new Set(["PGRST205", "PGRST202", "42P01"]);

function failure(error: { code?: string; message: string } | null): StoreFailure {
  return {
    ok: false,
    missing: Boolean(error?.code && MISSING_CODES.has(error.code)),
    error: error?.message ?? "Unknown database error.",
  };
}

const COLUMNS =
  // evidence_path is read only to derive has_photo; toRow never passes it on.
  "id, created_at, member_id, category, event_key, event_label, points, occurred_on, note, evidence_path, " +
  "status, reviewed_at, review_note, member:member_id ( full_name, email, role ), reviewer:reviewed_by ( full_name )";

type Embedded<T> = T | T[] | null | undefined;
function one<T>(value: Embedded<T>): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

type RawRow = Omit<SubmissionRow, "member_name" | "member_email" | "member_role" | "reviewer_name"> & {
  member?: Embedded<{ full_name: string | null; email: string | null; role: string | null }>;
  reviewer?: Embedded<{ full_name: string | null }>;
  evidence_path?: string | null;
  evidence_mime?: string | null;
};

function toRow(raw: RawRow): SubmissionRow {
  const member = one(raw.member);
  return {
    id: raw.id,
    created_at: raw.created_at,
    member_id: raw.member_id,
    member_name: member?.full_name ?? null,
    member_email: member?.email ?? null,
    member_role: member?.role ?? null,
    category: raw.category as PointCategory,
    event_key: raw.event_key,
    event_label: raw.event_label,
    points: raw.points,
    occurred_on: raw.occurred_on,
    note: raw.note,
    has_photo: Boolean(raw.evidence_path),
    status: raw.status as SubmissionStatus,
    reviewed_at: raw.reviewed_at,
    review_note: raw.review_note,
    reviewer_name: one(raw.reviewer)?.full_name ?? null,
  };
}

/** Newest first. Pass `memberId` for one member's own; omit it for everyone's (exec). */
export async function listSubmissions(opts: { memberId?: string }): Promise<ListResult> {
  const sb = db();
  if (!sb) return NOT_CONFIGURED;

  const base = sb.from("point_submissions").select(COLUMNS);
  const { data, error } = await (opts.memberId ? base.eq("member_id", opts.memberId) : base).order(
    "created_at",
    { ascending: false }
  );
  if (error) return failure(error);
  return { ok: true, rows: ((data ?? []) as unknown as RawRow[]).map(toRow) };
}

/** One submission including where its photo is stored (if it has one), or null if there is no such row. */
export async function getSubmission(id: string): Promise<SubmissionWithEvidence | null> {
  const sb = db();
  if (!sb || !id) return null;

  const { data, error } = await sb
    .from("point_submissions")
    .select(`${COLUMNS}, evidence_mime`)
    .eq("id", id)
    .maybeSingle();
  // A malformed id is a Postgres cast error (22P02), which is still "no such row".
  if (error || !data) return null;

  const raw = data as unknown as RawRow;
  return { ...toRow(raw), evidence_path: raw.evidence_path ?? null, evidence_mime: raw.evidence_mime ?? null };
}

// Postgres not_null_violation: on an insert without a photo, it means the live
// table still has the original NOT NULL on evidence_path.
const NOT_NULL_VIOLATION = "23502";

const OPTIONAL_PHOTO_NOT_SET_UP =
  "Submitting without a photo isn't switched on yet. Exec need to run " +
  "db/point-submissions-optional-photo.sql in Supabase. Attach a photo for now.";

/**
 * Store the photo (if there is one), then the row.
 *
 * In that order so a row that names a photo always has one behind it. If the
 * insert fails, the orphaned photo is removed again. With no photo, both
 * evidence columns are null.
 */
export async function createSubmission(
  input: {
    member_id: string;
    category: PointCategory;
    event_key: string;
    event_label: string;
    points: number;
    occurred_on: string;
    note: string | null;
  },
  evidence: Evidence | null
): Promise<CreateResult> {
  const sb = db();
  if (!sb) return NOT_CONFIGURED;

  let path: string | null = null;
  if (evidence) {
    path = `${input.member_id}/${randomUUID()}.${extensionFor(evidence.mime)}`;
    const upload = await sb.storage.from(EVIDENCE_BUCKET).upload(path, evidence.bytes, {
      contentType: evidence.mime,
      upsert: false,
    });
    if (upload.error) {
      return { ok: false, missing: /bucket not found/i.test(upload.error.message), error: upload.error.message };
    }
  }

  const { data, error } = await sb
    .from("point_submissions")
    .insert({ ...input, evidence_path: path, evidence_mime: evidence?.mime ?? null })
    .select(COLUMNS)
    .single();

  if (error || !data) {
    if (path) await sb.storage.from(EVIDENCE_BUCKET).remove([path]);
    if (!evidence && error?.code === NOT_NULL_VIOLATION) {
      return { ok: false, missing: false, outdated: true, error: OPTIONAL_PHOTO_NOT_SET_UP };
    }
    return failure(error);
  }
  return { ok: true, row: toRow(data as unknown as RawRow) };
}

/** Approve or reject in one transaction (review_point_submission in the SQL). */
export async function reviewSubmission(
  id: string,
  reviewerId: string,
  decision: "approved" | "rejected",
  note: string | null,
  reason: string
): Promise<ReviewResult> {
  const sb = db();
  if (!sb) return NOT_CONFIGURED;

  const { data, error } = await sb.rpc("review_point_submission", {
    p_id: id,
    p_reviewer: reviewerId,
    p_decision: decision,
    p_note: note,
    p_reason: reason,
  });
  if (error) return failure(error);
  return { ok: true, outcome: String(data) };
}

/**
 * A member's points per category, from the ledger: approved submissions plus
 * whatever exec awarded by hand. Zeros when the ledger or its category column
 * isn't there yet, which is all the ledger could say in that state anyway.
 */
export async function ledgerCategoryTotals(memberId: string): Promise<CategoryTotals> {
  const sb = db();
  if (!sb) return emptyCategoryTotals();
  const { data, error } = await sb.from("point_entries").select("delta, category").eq("member_id", memberId);
  if (error || !data) return emptyCategoryTotals();
  return categoryTotals(data as Pick<PointEntry, "delta" | "category">[]).categories;
}

/** Pending count for the exec dashboard card. Null when the table isn't there yet. */
export async function countPendingSubmissions(): Promise<number | null> {
  const sb = db();
  if (!sb) return null;
  const { count, error } = await sb
    .from("point_submissions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return null;
  return count ?? 0;
}

// `<ArrayBuffer>` is needed: a bare Uint8Array widens to Uint8Array<ArrayBufferLike>,
// which NextResponse's BodyInit does not accept.
export async function downloadEvidence(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const sb = db();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(EVIDENCE_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
