import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { submitReview, getAssignments } from "@/features/03-recruitment-ats/lib/store";
import { canReview, canReviewApplicant } from "@/features/03-recruitment-ats/lib/access";
import { RUBRIC, type Scores, type RubricKey } from "@/features/03-recruitment-ats/lib/types";

// A reviewer submits/updates their own review (one per applicant).
//
// Two gates, both required: the role must be a recruiting role, and the reviewer
// must be ASSIGNED to this applicant. Assignment is the fairness mechanism of the
// screen (planAssignments spreads applicants randomly and evenly, and nobody picks
// who they review), so it is enforced rather than suggested — the same posture the
// interview rubric route takes with panel membership. Exec bypasses both.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const role = session?.user?.role;
  if (!canReview(role)) {
    return NextResponse.json({ ok: false, error: "Reviewer access required" }, { status: 403 });
  }

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

  // Assignment check happens after validation so a malformed payload still reports
  // the payload problem rather than a misleading permission error.
  const assignments = await getAssignments();
  if (!canReviewApplicant(role, email, body.applicant_id, assignments)) {
    return NextResponse.json(
      { ok: false, error: "You are not assigned to this applicant." },
      { status: 403 }
    );
  }

  const result = await submitReview({ applicant_id: body.applicant_id, reviewer_email: email, scores, notes: body.notes });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — review not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
