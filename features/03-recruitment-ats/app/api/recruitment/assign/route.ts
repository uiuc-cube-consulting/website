import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { assignReviewers } from "@/features/03-recruitment-ats/lib/store";
import { MIN_REVIEWERS_PER_APPLICANT } from "@/features/03-recruitment-ats/lib/assignment";

// Exec-only: randomly + evenly assign k reviewers to every active applicant.
// Optionally restricted to a chosen subset of the pool (body.reviewer_emails).
// `reshuffle: true` re-deals from scratch instead of topping up.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "exec") return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: { k?: number; reviewer_emails?: unknown; reshuffle?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* default k, whole pool */
  }

  // Optional narrowing of the reviewer pool: exec ticks who is actually doing
  // this cycle. Shape-checked here; membership is enforced in the store, which
  // intersects against the real pool rather than trusting these values.
  let reviewerEmails: string[] | undefined;
  if (body.reviewer_emails !== undefined) {
    if (!Array.isArray(body.reviewer_emails) || body.reviewer_emails.some((e) => typeof e !== "string")) {
      return NextResponse.json({ ok: false, error: "reviewer_emails must be an array of strings" }, { status: 400 });
    }
    reviewerEmails = body.reviewer_emails as string[];
  }
  // Floor is MIN_REVIEWERS_PER_APPLICANT, not 1. Every written application gets at
  // least two independent reads — one reviewer produces a mean with no spread,
  // which reads as consensus and hides a miscalibrated scorer.
  const k = Math.max(MIN_REVIEWERS_PER_APPLICANT, Math.min(5, Number(body.k) || MIN_REVIEWERS_PER_APPLICANT));

  // Reshuffle tears down the current spread for active applicants and deals
  // again. Opt-in, because it is destructive: the default run only tops up.
  const reshuffle = body.reshuffle === true;

  const result = await assignReviewers(k, reviewerEmails, { reshuffle });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — assignments not saved." });
  }
  if (!result.ok) {
    // A rejected SELECTION is exec's input to correct (too few people ticked,
    // none of them eligible) — 400, and hand back which emails were dropped so
    // the UI can say why. A failure with no selection is a real server fault.
    const status = reviewerEmails ? 400 : 500;
    return NextResponse.json({ ok: false, error: result.error, ignored: result.ignored }, { status });
  }
  return NextResponse.json(result);
}
