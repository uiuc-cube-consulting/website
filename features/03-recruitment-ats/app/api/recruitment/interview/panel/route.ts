import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { setPanel } from "@/features/03-recruitment-ats/lib/interview-store";
import {
  canInterviewInRound,
  isInterviewRound,
  type InterviewRound,
} from "@/features/03-recruitment-ats/lib/rounds";
import { getReviewerPool } from "@/features/03-recruitment-ats/lib/store";

// Exec-only: set who is interviewing a candidate IN ONE ROUND. This is what
// grants those interviewers the right to fill in that candidate's rubrics for
// that round — and no one else's, and no other round's.
//
// The round is required rather than defaulted. A panel written into the wrong
// round is a silent authorization bug in both directions: the people who are
// actually in the room cannot save, and people who are not can.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session?.user?.role !== "exec") {
    return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });
  }

  let body: { applicant_id?: string; interviewer_emails?: unknown; round?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id) {
    return NextResponse.json({ ok: false, error: "applicant_id required" }, { status: 400 });
  }
  if (!isInterviewRound(body.round)) {
    return NextResponse.json(
      { ok: false, error: "round must be 'first_round' or 'final_round'" },
      { status: 400 }
    );
  }
  const round: InterviewRound = body.round;
  if (!Array.isArray(body.interviewer_emails)) {
    return NextResponse.json({ ok: false, error: "interviewer_emails must be an array" }, { status: 400 });
  }
  const requested = [
    ...new Set(
      body.interviewer_emails
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    ),
  ];

  // Intersect with who may actually interview in this round, rather than trusting
  // the list. Only exec reaches this route, but a final-round panel naming a PM
  // would produce rows that authorize nothing — `saveRubric` refuses them — and
  // exec would be left believing the candidate was staffed. Anything dropped is
  // named in the response instead of disappearing.
  const pool = await getReviewerPool();
  const eligible = new Set(
    pool.filter((p) => canInterviewInRound(round, p.role)).map((p) => p.email.toLowerCase())
  );
  const emails = requested.filter((e) => eligible.has(e));
  const ignored = requested.filter((e) => !eligible.has(e));

  const result = await setPanel({
    applicant_id: body.applicant_id,
    interviewer_emails: emails,
    assigned_by: email,
    round,
  });

  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — panel not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, round, panel: result.panel, ignored });
}
