import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { aggregate, funnel, type Review } from "@/features/03-recruitment-ats/lib/types";

// Auth-gated reviewer feed. Returns per-applicant aggregates (mean, spread,
// per-criterion) plus the CURRENT reviewer's own review — but never other reviewers'
// individual scores/notes, so review can stay blind-ish until you submit.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { applicants, reviews, demo } = await getSnapshot();
    const rows = applicants.map((a) => {
      const agg = aggregate(a, reviews);
      const mine: Review | undefined = reviews.find(
        (r) => r.applicant_id === a.id && r.reviewer_email.toLowerCase() === email
      );
      return {
        ...agg,
        hasReviewed: Boolean(mine),
        myReview: mine ? { scores: mine.scores, notes: mine.notes ?? "" } : null,
      };
    });
    return NextResponse.json({ applicants: rows, funnel: funnel(applicants), demo, reviewer: email });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load applicants" },
      { status: 500 }
    );
  }
}
