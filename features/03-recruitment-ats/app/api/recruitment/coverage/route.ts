import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCoverage } from "@/features/03-recruitment-ats/lib/store";
import { canAccessRecruiting } from "@/features/03-recruitment-ats/lib/access";
import { canViewRecruiting, resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { excludeOwnApplications } from "@/features/03-recruitment-ats/lib/self-access";
import { summarizeCoverage } from "@/features/03-recruitment-ats/lib/assignment";

// Who is short of reviewers, and who still owes one, FOR ONE CYCLE (the active
// one unless `?cycle=` names another).
//
// Visible to every recruiting role, not just exec: the fastest way to close a
// coverage gap is for the people who owe reviews to see that they owe them.
// Scoped to a cycle because a gap on a cohort that was decided last semester is
// not work anybody can do — it would sit in the report permanently, and a report
// that always shows outstanding items stops being read.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessRecruiting(session.user.role)) {
    return NextResponse.json({ error: "Recruiting access required" }, { status: 403 });
  }
  if (!(await canViewRecruiting(session.user.role))) {
    return NextResponse.json({ error: "Recruiting is currently closed" }, { status: 403 });
  }

  const cycle = await resolveCycle(new URL(req.url).searchParams.get("cycle"));
  const result = await getCoverage(cycle);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  // Your own application is not yours to read (lib/self-access.ts). A coverage
  // row names the candidate and the reviewers reading them, so leaving your own
  // in would tell you who is screening you — the one thing the blind screen is
  // built to withhold.
  //
  // The summary is computed AFTER redaction so the numbers match the rows on
  // screen. That makes a viewer who applied see a total one lower than exec
  // does, which is the right trade: a coverage count is a prompt to go chase a
  // missing review, and a prompt you cannot act on is worse than a smaller one.
  const rows = excludeOwnApplications(session.user.email, result.rows, (r) => r.email);
  return NextResponse.json({ ...summarizeCoverage(rows), rows, cycle, demo: result.demo ?? false });
}
