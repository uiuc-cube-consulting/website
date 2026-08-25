import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { reassignReviewer } from "@/features/03-recruitment-ats/lib/store";
import { canDecide } from "@/features/03-recruitment-ats/lib/access";
import type { ReassignAction } from "@/features/03-recruitment-ats/lib/assignment";

// EXEC-ONLY: reroute one candidate's reviewers by hand.
//
// The delibs-day escape hatch. The random spread in ../route.ts is the default
// and stays untouched; this is for the moment someone is absent and a candidate
// needs an eye on them right now. Exec-only for the same reason stage decisions
// are: it overrides the fairness mechanism, so it should be a small number of
// accountable people doing it deliberately.

export const dynamic = "force-dynamic";

const ACTIONS: ReassignAction[] = ["add", "remove", "swap"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canDecide(session.user.role)) {
    return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });
  }

  let body: { action?: string; applicant_id?: string; to?: string; from?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id) {
    return NextResponse.json({ ok: false, error: "applicant_id is required" }, { status: 400 });
  }
  if (!ACTIONS.includes(body.action as ReassignAction)) {
    return NextResponse.json(
      { ok: false, error: `action must be one of ${ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const result = await reassignReviewer({
    action: body.action as ReassignAction,
    applicant_id: body.applicant_id,
    to: body.to,
    from: body.from,
    force: Boolean(body.force),
  });

  if (!result.ok && "demo" in result) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — nothing changed." });
  }
  if (!result.ok) {
    // A rule violation (already assigned, would drop below the minimum, not an
    // eligible reviewer) is the caller's problem, not a server fault.
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }
  return NextResponse.json(result);
}
