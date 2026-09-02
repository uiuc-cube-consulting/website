import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { saveRubric } from "@/features/03-recruitment-ats/lib/interview-store";
import {
  INTERVIEW_KINDS,
  rubricMax,
  SCORE_KEY,
  canInterview,
  isInterviewKind,
  isRecommendation,
  roundOfKind,
  type Recommendation,
} from "@/features/03-recruitment-ats/lib/interview";
import { canInterviewInRound, canViewRound } from "@/features/03-recruitment-ats/lib/rounds";
import { SELF_ACCESS_DENIED } from "@/features/03-recruitment-ats/lib/self-access";
import { isOwnApplicationId } from "@/features/03-recruitment-ats/lib/self-access-store";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";

// An interviewer fills in ONE rubric for ONE candidate. The `kind` says which
// rubric AND which round: case/behavioral are the first round, final_case and
// final_behavioral are the exec-only final.
//
// Three things are deliberately not trusted from the client:
//   · the reviewer identity — always the session email, never the body
//   · the round — derived from the kind, never sent alongside it, so the two
//     cannot be made to disagree
//   · the right to write at all — the round's role floor is checked here and panel
//     membership for that round is enforced in the store, so an interviewer can
//     only ever edit the rubric instance for a candidate they are handling, in the
//     round they are handling them for. The rubric TEMPLATES live in code and no
//     endpoint can change them.

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
    return NextResponse.json(
      { ok: false, error: `kind must be one of: ${INTERVIEW_KINDS.join(", ")}` },
      { status: 400 }
    );
  }

  // You never score your own interview (lib/self-access.ts). Ahead of the round
  // gate below so a candidate gets the reason that actually applies to them,
  // rather than being told the final round is exec-only — and ahead of the panel
  // lookup in `saveRubric`, which exec bypasses via `bypassPanel` anyway.
  if (await isOwnApplicationId(body.applicant_id, email)) {
    return NextResponse.json({ ok: false, error: SELF_ACCESS_DENIED }, { status: 403 });
  }

  // A final-round rubric is exec-only to read and exec-only to write. Checked
  // before the panel lookup so a non-exec cannot learn, from the difference
  // between a 403 and a "not on the panel" 403, who exec has staffed the final
  // round with.
  const round = roundOfKind(body.kind);
  const role = session?.user?.role;
  if (!canViewRound(round, role) || !canInterviewInRound(round, role)) {
    return NextResponse.json({ ok: false, error: "The final round is exec only" }, { status: 403 });
  }

  // One number: the total off the paper rubric, a whole number in 0..max. Anything
  // else the client sends is dropped rather than stored, so the row always matches
  // what the code believes a review is.
  //
  // The raw value is tested rather than `Number(...)` of it: 0 is a real total on
  // these sheets, and coercion turns null, "" and [] into exactly that — which
  // would store an untouched form as the harshest possible review.
  const max = rubricMax(body.kind);
  const total = body.scores?.[SCORE_KEY];
  if (typeof total !== "number" || !Number.isInteger(total) || total < 0 || total > max) {
    return NextResponse.json(
      { ok: false, error: `Score must be a whole number from 0 to ${max}` },
      { status: 400 }
    );
  }
  const scores: Record<string, number> = { [SCORE_KEY]: total };

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
    bypassPanel: role === "exec",
  });

  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — rubric not saved." });
  }
  if (result.forbidden) return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
