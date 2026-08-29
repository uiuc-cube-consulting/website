import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBoard } from "@/features/03-recruitment-ats/lib/interview-store";
import { canInterview } from "@/features/03-recruitment-ats/lib/interview";
import {
  INTERVIEW_ROUNDS,
  canInterviewInRound,
  canViewRound,
  isInterviewRound,
  type InterviewRound,
} from "@/features/03-recruitment-ats/lib/rounds";
import { getReviewerPool } from "@/features/03-recruitment-ats/lib/store";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";

// One ROUND's interviewer console: the candidates live in that round, their
// resume pointer, who is on their panel for it, and the CURRENT interviewer's own
// rubrics. Other interviewers' scores and notes are never included — same
// blind-ish posture as the written-application feed.
//
// ?round=first_round (default) | final_round
//
// The final round is exec-only, and this is where that is enforced. It is not
// enough to hide the tab: anyone can call this route directly, so a non-exec
// asking for the final round is refused here, before `getBoard` runs and before a
// single final-round score is read out of the database.
//
// The whole round is returned at once so name search filters instantly in the browser.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = session?.user?.role;
  if (!canInterview(role)) {
    return NextResponse.json({ error: "Interviewer access required" }, { status: 403 });
  }
  if (!(await canViewRecruiting(role))) {
    return NextResponse.json({ error: "Recruiting is currently closed" }, { status: 403 });
  }

  const requested = new URL(req.url).searchParams.get("round") ?? "first_round";
  if (!isInterviewRound(requested)) {
    return NextResponse.json(
      { error: "round must be 'first_round' or 'final_round'" },
      { status: 400 }
    );
  }
  const round: InterviewRound = requested;
  if (!canViewRound(round, role)) {
    return NextResponse.json({ error: "The final round is exec only" }, { status: 403 });
  }

  const canManage = role === "exec";
  const availableRounds = INTERVIEW_ROUNDS.filter((r) => canViewRound(r, role));

  try {
    const board = await getBoard(email, canManage, round);
    // Exec assigns panels, so it needs the list of people it can assign. Narrowed
    // to who may actually interview in THIS round — the final round is staffed by
    // exec alone — rather than offering names the panel route would then refuse.
    const pool =
      canManage && !board.demo
        ? (await getReviewerPool()).filter((p) => canInterviewInRound(round, p.role))
        : [];
    return NextResponse.json({ ...board, availableRounds, pool });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load the interview board" },
      { status: 500 }
    );
  }
}
