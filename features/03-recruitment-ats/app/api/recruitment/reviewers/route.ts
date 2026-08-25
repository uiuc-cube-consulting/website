import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getReviewerPool } from "@/features/03-recruitment-ats/lib/store";
import { canDecide } from "@/features/03-recruitment-ats/lib/access";

// EXEC-ONLY: the pool of people eligible to review, for the reroute picker.
//
// Exec-gated rather than open to all reviewers: it is a roster of members and
// their emails, and only exec can act on it via /assign/manual anyway.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canDecide(session.user.role)) {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }
  try {
    const reviewers = await getReviewerPool();
    return NextResponse.json({ reviewers });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load reviewers" },
      { status: 500 }
    );
  }
}
