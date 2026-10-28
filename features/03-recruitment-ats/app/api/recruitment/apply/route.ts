import { NextRequest, NextResponse } from "next/server";
import { createApplicant } from "@/features/03-recruitment-ats/lib/store";
import { getActiveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { validateIntake } from "@/features/03-recruitment-ats/lib/intake";

// Public endpoint — the applicant intake form posts here. No auth (anyone can apply),
// but writes go through the server service role; the table is RLS-locked to anon.
//
// The application is stamped with the ACTIVE CYCLE, resolved on the server. It is
// deliberately not taken from the request: an applicant does not get to choose
// which cohort they are judged against, and a stale form left open across the
// turn of a semester would otherwise post into the previous one.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const intake = validateIntake(body);
  if (intake.kind === "honeypot") return NextResponse.json({ ok: true });
  if (intake.kind === "invalid") {
    return NextResponse.json({ ok: false, error: intake.error }, { status: 400 });
  }

  const result = await createApplicant({
    ...intake.applicant,
    cycle: await getActiveCycle(),
  });

  if (result.demo) {
    return NextResponse.json({
      ok: false,
      demo: true,
      message: "Recruitment storage isn't configured yet (Supabase). Your responses were not saved.",
    });
  }
  // A second application in the same cycle is the candidate's own mistake and
  // they can act on it; anything else here is ours. 409 rather than 500 so the
  // form shows "you've already applied" instead of inviting a retry that will
  // fail identically. Applying again in a LATER cycle is not a conflict at all
  // and never reaches this branch.
  if (result.duplicate) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, id: result.id });
}
