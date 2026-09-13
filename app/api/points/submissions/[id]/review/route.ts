import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { ledgerReason, MAX_NOTE } from "@/lib/point-catalog";
import { getSubmission, reviewSubmission } from "@/lib/point-submissions-store";

export const dynamic = "force-dynamic";

/**
 * POST /api/points/submissions/[id]/review — approve or reject. EXEC ONLY.
 *
 * body: { decision: "approve" | "reject", note?: string }
 *
 * Approving writes the points to the ledger in the same transaction that marks
 * the submission approved (review_point_submission in db/point-submissions.sql).
 * Rejecting needs a note, because it's the only explanation the member gets.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "exec") {
    return NextResponse.json({ error: "Only exec can review point submissions." }, { status: 403 });
  }

  const { id } = await ctx.params;

  let body: { decision?: unknown; note?: unknown };
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decision =
    body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : null;
  if (!decision) {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > MAX_NOTE) {
    return NextResponse.json({ error: `Keep the note under ${MAX_NOTE} characters.` }, { status: 400 });
  }
  if (decision === "rejected" && !note) {
    return NextResponse.json(
      { error: "Add a note saying why. The member sees it on their submission." },
      { status: 400 }
    );
  }

  const submission = await getSubmission(id);
  if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  // Exec can't submit, but someone promoted to exec mid-semester may still have
  // their own submissions pending from before.
  if (submission.member_id === session.user.memberId) {
    return NextResponse.json({ error: "You can't review your own submission." }, { status: 403 });
  }
  if (submission.status !== "pending") {
    return NextResponse.json({ error: `This submission was already ${submission.status}.` }, { status: 409 });
  }

  const result = await reviewSubmission(
    id,
    session.user.memberId,
    decision,
    note || null,
    ledgerReason(submission)
  );
  if (!result.ok) {
    return NextResponse.json(
      { error: result.missing ? "Run db/point-submissions.sql in Supabase to enable reviews." : result.error },
      { status: result.missing ? 503 : 500 }
    );
  }

  if (result.outcome === "approved" || result.outcome === "rejected") {
    return NextResponse.json({ ok: true, status: result.outcome });
  }
  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  }
  // 'already_approved' / 'already_rejected': another exec got there between our
  // read above and the locked update.
  return NextResponse.json({ error: "Someone else reviewed this first. Refresh to see it." }, { status: 409 });
}
