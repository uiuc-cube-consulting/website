import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { assignReviewers } from "@/features/03-recruitment-ats/lib/store";
import { MIN_REVIEWERS_PER_APPLICANT } from "@/features/03-recruitment-ats/lib/assignment";

// Exec-only: randomly + evenly assign k reviewers to every active applicant.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "exec") return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: { k?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* default k */
  }
  // Floor is MIN_REVIEWERS_PER_APPLICANT, not 1. Every written application gets at
  // least two independent reads — one reviewer produces a mean with no spread,
  // which reads as consensus and hides a miscalibrated scorer.
  const k = Math.max(MIN_REVIEWERS_PER_APPLICANT, Math.min(5, Number(body.k) || MIN_REVIEWERS_PER_APPLICANT));

  const result = await assignReviewers(k);
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — assignments not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
