// Server-only persistence for portal feedback. Same convention as the other
// features: Supabase when it's configured, and a degraded-but-honest path when
// it isn't. Never import this from client code.

import { createServerClient } from "@/lib/supabase/server";
import type { FeedbackKind, ScreenshotMime } from "./types";
import { extensionFor } from "./types";

/**
 * Private Storage bucket holding the screenshots.
 *
 * Private is load-bearing, not cautious defaulting. A screenshot of the portal
 * is by definition a picture of whatever the member was looking at, which on
 * these pages means strikes, accountability ratings, or an applicant's file. A
 * public bucket would hand all of that to anyone who guessed a URL, and the
 * issue it is linked from is itself public. Everything reaching a browser goes
 * through /api/feedback/screenshot/[id], which checks a session first.
 */
export const SCREENSHOT_BUCKET = "feedback-screenshots";

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

export function supabaseConfigured(): boolean {
  return db() !== null;
}

// A member can file this many reports an hour. The widget writes to a PUBLIC
// issue tracker on a button press, so the ceiling is less about load than about
// a stuck finger — or a bored one — producing forty public issues signed with
// someone's name.
function rateLimit(): number {
  const raw = Number(process.env.FEEDBACK_RATE_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

export type FeedbackRow = {
  id: string;
  created_at: string;
  member_email: string;
  member_name: string | null;
  member_role: string | null;
  kind: FeedbackKind;
  description: string;
  page_path: string;
  screenshot_path: string | null;
  screenshot_mime: string | null;
  issue_number: number | null;
  issue_url: string | null;
};

/**
 * How many reports this member has filed in the last hour.
 *
 * Returns 0 when Supabase is absent — there is no table to count, and refusing
 * everyone would be a worse failure than filing without a limit on a
 * deployment that has no database at all.
 */
export async function recentFeedbackCount(email: string): Promise<{ count: number; limit: number }> {
  const limit = rateLimit();
  const sb = db();
  if (!sb) return { count: 0, limit };

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await sb
    .from("portal_feedback")
    .select("id", { count: "exact", head: true })
    .eq("member_email", email)
    .gte("created_at", since);

  // A counting failure must not become a refusal: the table may simply not have
  // been created yet (the SQL in db/schema.sql is run by hand), and the report
  // still deserves to reach GitHub.
  if (error) return { count: 0, limit };
  return { count: count ?? 0, limit };
}

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; demo: true }
  | { ok: false; demo?: false; error: string };

/**
 * Record the report before filing it.
 *
 * The row exists mainly so the screenshot has an id to be addressed by — the
 * GitHub issue is the artifact people actually work from. So a failure here is
 * reported to the caller but is NOT fatal to the submission: the route carries
 * on and files the issue without a screenshot link, which is a far better
 * outcome than losing the report because a migration has not been run yet.
 */
export async function createFeedbackRecord(input: {
  member_id: string | null;
  member_email: string;
  member_name: string | null;
  member_role: string | null;
  kind: FeedbackKind;
  description: string;
  page_path: string;
  viewport: string | null;
}): Promise<CreateResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const { data, error } = await sb
    .from("portal_feedback")
    .insert({
      member_id: input.member_id,
      member_email: input.member_email,
      member_name: input.member_name,
      member_role: input.member_role,
      kind: input.kind,
      description: input.description,
      page_path: input.page_path,
      viewport: input.viewport,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Could not record the report." };
  return { ok: true, id: data.id as string };
}

/** Put the image in the private bucket and remember where it went. */
export async function saveScreenshot(
  id: string,
  bytes: Uint8Array,
  mime: ScreenshotMime
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const sb = db();
  if (!sb) return { ok: false, error: "Supabase not configured." };

  const path = `${id}.${extensionFor(mime)}`;
  const { error } = await sb.storage.from(SCREENSHOT_BUCKET).upload(path, bytes, {
    contentType: mime,
    // The path is derived from a freshly minted row id, so an existing object
    // means a retry of the same submission rather than a collision.
    upsert: true,
  });
  if (error) return { ok: false, error: error.message };

  const { error: linkError } = await sb
    .from("portal_feedback")
    .update({ screenshot_path: path, screenshot_mime: mime })
    .eq("id", id);
  if (linkError) return { ok: false, error: linkError.message };

  return { ok: true, path };
}

/** Backfill the issue reference once GitHub has answered. */
export async function attachIssue(id: string, number: number, url: string): Promise<void> {
  const sb = db();
  if (!sb) return;
  // Best-effort: the issue exists whether or not we manage to note it here, and
  // failing the request after the issue was filed would tell the member their
  // report was lost when it wasn't.
  await sb.from("portal_feedback").update({ issue_number: number, issue_url: url }).eq("id", id);
}

export async function getFeedback(id: string): Promise<FeedbackRow | null> {
  const sb = db();
  if (!sb) return null;
  const { data, error } = await sb
    .from("portal_feedback")
    .select(
      "id, created_at, member_email, member_name, member_role, kind, description, page_path, screenshot_path, screenshot_mime, issue_number, issue_url"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as FeedbackRow;
}

// The `<ArrayBuffer>` argument is not decoration: a bare `Uint8Array` widens to
// `Uint8Array<ArrayBufferLike>`, which `BodyInit` does not accept, and the
// route that streams these bytes fails to typecheck.
export async function downloadScreenshot(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const sb = db();
  if (!sb) return null;
  const { data, error } = await sb.storage.from(SCREENSHOT_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}
