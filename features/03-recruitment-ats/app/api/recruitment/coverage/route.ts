import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCoverage } from "@/features/03-recruitment-ats/lib/store";
import { canAccessRecruiting } from "@/features/03-recruitment-ats/lib/access";
import { summarizeCoverage } from "@/features/03-recruitment-ats/lib/assignment";

// Who is short of reviewers, and who still owes one.
//
// Visible to every recruiting role, not just exec: the fastest way to close a
// coverage gap is for the people who owe reviews to see that they owe them.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessRecruiting(session.user.role)) {
    return NextResponse.json({ error: "Recruiting access required" }, { status: 403 });
  }

  const result = await getCoverage();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ ...summarizeCoverage(result.rows), rows: result.rows, demo: result.demo ?? false });
}
