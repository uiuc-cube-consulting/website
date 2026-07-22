import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAssignments, getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { aggregate, funnel, type Review } from "@/features/03-recruitment-ats/lib/types";

// Auth-gated reviewer feed. Returns per-applicant aggregates (mean, spread,
// per-criterion) plus the CURRENT reviewer's own review — never other reviewers'
// individual scores/notes, so review stays blind-ish until you submit. Also marks
// which applicants are assigned to the current reviewer and their review progress.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session?.user?.role;

  try {
    const { applicants, reviews, demo } = await getSnapshot();
    const assignments = await getAssignments();
    const mine = new Set(
      assignments.filter((a) => a.reviewer_email.toLowerCase() === email).map((a) => a.applicant_id)
    );

    const rows = applicants.map((a) => {
      const agg = aggregate(a, reviews);
      const myReview: Review | undefined = reviews.find(
        (r) => r.applicant_id === a.id && r.reviewer_email.toLowerCase() === email
      );
      return {
        ...agg,
        hasReviewed: Boolean(myReview),
        assignedToMe: mine.has(a.id),
        myReview: myReview ? { scores: myReview.scores, notes: myReview.notes ?? "" } : null,
      };
    });

    // Progress over the current reviewer's assigned queue.
    const assigned = rows.filter((r) => r.assignedToMe);
    const reviewed = assigned.filter((r) => r.hasReviewed).length;
    const progress = { assigned: assigned.length, reviewed, pending: assigned.length - reviewed };

    return NextResponse.json({
      applicants: rows,
      funnel: funnel(applicants),
      demo,
      reviewer: email,
      progress,
      hasAssignments: assignments.length > 0,
      canManage: role === "exec",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load applicants" },
      { status: 500 }
    );
  }
}
