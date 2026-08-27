import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBoard } from "@/features/03-recruitment-ats/lib/interview-store";
import { canInterview } from "@/features/03-recruitment-ats/lib/interview";
import { getReviewerPool } from "@/features/03-recruitment-ats/lib/store";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";

// The interviewer console feed: every candidate, their resume pointer, who is on
// their panel, and the CURRENT interviewer's own rubrics. Other interviewers'
// scores and notes are never included — same blind-ish posture as the screen feed.
//
// The whole set is returned once so name search filters instantly in the browser.

export const dynamic = "force-dynamic";

export async function GET() {
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
  const canManage = role === "exec";

  try {
    const board = await getBoard(email, canManage);
    // Exec assigns panels, so it needs the list of people it can assign.
    const pool = canManage && !board.demo ? await getReviewerPool() : [];
    return NextResponse.json({ ...board, pool });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load the interview board" },
      { status: 500 }
    );
  }
}
