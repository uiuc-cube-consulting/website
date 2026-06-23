import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { submitReview } from "@/features/03-recruitment-ats/lib/store";
import { RUBRIC, type Scores, type RubricKey } from "@/features/03-recruitment-ats/lib/types";

// Auth-gated: a reviewer submits/updates their own review (one per applicant).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { applicant_id?: string; scores?: Partial<Record<RubricKey, number>>; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id) return NextResponse.json({ ok: false, error: "applicant_id required" }, { status: 400 });

  // Validate every rubric criterion is a 1–5 score.
  const scores = {} as Scores;
  for (const r of RUBRIC) {
    const v = Number(body.scores?.[r.key]);
    if (!Number.isFinite(v) || v < 1 || v > 5) {
      return NextResponse.json({ ok: false, error: `Score for "${r.label}" must be 1–5` }, { status: 400 });
    }
    scores[r.key] = v;
  }

  const result = await submitReview({ applicant_id: body.applicant_id, reviewer_email: email, scores, notes: body.notes });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — review not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
