import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { submitReview, getAssignments } from "@/features/03-recruitment-ats/lib/store";
import { canReview, canReviewApplicant, isExec } from "@/features/03-recruitment-ats/lib/access";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";
import { SELF_ACCESS_DENIED } from "@/features/03-recruitment-ats/lib/self-access";
import { isOwnApplicationId } from "@/features/03-recruitment-ats/lib/self-access-store";
import { getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { ROUND_STAGES } from "@/features/03-recruitment-ats/lib/rounds";
import {
  RUBRIC,
  SCREEN_MAX_POINTS,
  isValidScore,
  screenTotal,
  type Scores,
  type RubricKey,
} from "@/features/03-recruitment-ats/lib/types";

// A reviewer submits/updates their own WRITTEN-APPLICATION review (one per
// applicant). The later rounds are scored through
// /api/recruitment/interview/rubric instead.
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
  if (!(await canViewRecruiting(role))) {
    return NextResponse.json({ ok: false, error: "Recruiting is currently closed" }, { status: 403 });
  }

  let body: { applicant_id?: string; scores?: Partial<Record<RubricKey, number>>; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id) return NextResponse.json({ ok: false, error: "applicant_id required" }, { status: 400 });

  // Every criterion carries a whole-number score within ITS OWN range — the
  // ceilings differ (the case essay is worth 7, a short essay 3). Zero is valid
  // and means an unanswered or worthless answer, so this is a range check, not a
  // truthiness one: refusing 0 would force reviewers to inflate a blank essay to
  // a 1 just to submit.
  const scores = {} as Scores;
  for (const c of RUBRIC) {
    if (!isValidScore(c, body.scores?.[c.key])) {
      return NextResponse.json(
        { ok: false, error: `Score for "${c.label}" must be a whole number from 0 to ${c.max}` },
        { status: 400 }
      );
    }
    scores[c.key] = Number(body.scores?.[c.key]);
  }

  // You never score your own application (lib/self-access.ts). Deliberately
  // AHEAD of both checks below and with no `isExec` escape hatch, unlike either
  // of them: assignment can be overridden because a stuck queue needs
  // unblocking, and the written-round stage gate can be overridden to correct a
  // record after the fact. Scoring yourself is neither of those — there is
  // nothing to unblock and nothing to correct, and exec is the role most likely
  // to have an old application sitting in the table.
  if (await isOwnApplicationId(body.applicant_id, email)) {
    return NextResponse.json({ ok: false, error: SELF_ACCESS_DENIED }, { status: 403 });
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

  // This rubric scores the WRITTEN round only. A candidate already in interviews
  // is being scored on the case and behavioral rubrics now, and a late screen
  // review landing on them would quietly move the written mean underneath a
  // decision that has already been made. Exec can still correct a record after
  // the fact — the same escape hatch it has everywhere else in this route.
  const { applicants } = await getSnapshot();
  const applicant = applicants.find((a) => a.id === body.applicant_id);
  if (!applicant) {
    return NextResponse.json({ ok: false, error: "Unknown applicant." }, { status: 404 });
  }
  if (!isExec(role) && !ROUND_STAGES.written.includes(applicant.stage)) {
    return NextResponse.json(
      {
        ok: false,
        error: `${applicant.name} has already left the written round — their stage is "${applicant.stage}".`,
      },
      { status: 409 }
    );
  }

  const result = await submitReview({ applicant_id: body.applicant_id, reviewer_email: email, scores, notes: body.notes });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — review not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  // Echo the total the server computed, so the UI never has to re-derive it.
  return NextResponse.json({ ok: true, total: screenTotal(scores), max: SCREEN_MAX_POINTS });
}
