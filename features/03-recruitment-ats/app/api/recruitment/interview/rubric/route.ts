import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveRubric } from "@/features/03-recruitment-ats/lib/interview-store";
import {
  INTERVIEW_RUBRICS,
  canInterview,
  isInterviewKind,
  isRecommendation,
  type Recommendation,
} from "@/features/03-recruitment-ats/lib/interview";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";

// An interviewer fills in ONE rubric (case or behavioral) for ONE candidate.
//
// Two things are deliberately not trusted from the client:
//   · the reviewer identity — always the session email, never the body
//   · the right to write at all — enforced by panel membership in the store, so an
//     interviewer can only ever edit the rubric instance for a candidate they are
//     handling. The rubric TEMPLATES live in code and no endpoint can change them.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canInterview(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: "Interviewer access required" }, { status: 403 });
  }
  if (!(await canViewRecruiting(session?.user?.role))) {
    return NextResponse.json({ ok: false, error: "Recruiting is currently closed" }, { status: 403 });
  }

  let body: {
    applicant_id?: string;
    kind?: string;
    scores?: Record<string, unknown>;
    notes?: string;
    recommendation?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id) {
    return NextResponse.json({ ok: false, error: "applicant_id required" }, { status: 400 });
  }
  if (!isInterviewKind(body.kind)) {
    return NextResponse.json({ ok: false, error: "kind must be 'case' or 'behavioral'" }, { status: 400 });
  }

  // Every criterion of the chosen rubric must carry a 1–5 score. Unknown keys are
  // dropped rather than stored, so the row always matches the rubric in code.
  const scores: Record<string, number> = {};
  for (const c of INTERVIEW_RUBRICS[body.kind]) {
    const v = Number(body.scores?.[c.key]);
    if (!Number.isFinite(v) || v < 1 || v > 5) {
      return NextResponse.json({ ok: false, error: `Score for "${c.label}" must be 1–5` }, { status: 400 });
    }
    scores[c.key] = v;
  }

  let recommendation: Recommendation | null = null;
  if (body.recommendation != null && body.recommendation !== "") {
    if (!isRecommendation(body.recommendation)) {
      return NextResponse.json({ ok: false, error: "Invalid recommendation" }, { status: 400 });
    }
    recommendation = body.recommendation;
  }

  const result = await saveRubric({
    applicant_id: body.applicant_id,
    reviewer_email: email,
    kind: body.kind,
    scores,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    recommendation,
    bypassPanel: session?.user?.role === "exec",
  });

  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — rubric not saved." });
  }
  if (result.forbidden) return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
