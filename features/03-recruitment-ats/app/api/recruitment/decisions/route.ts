import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { setDecision } from "@/features/03-recruitment-ats/lib/store";
import { STAGES, type Stage } from "@/features/03-recruitment-ats/lib/types";

// Auth-gated: move an applicant to a new stage (advance / reject / etc.).

export const dynamic = "force-dynamic";

const VALID: Stage[] = [...STAGES, "rejected", "withdrawn"];

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { applicant_id?: string; stage?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id || !body.stage || !VALID.includes(body.stage as Stage)) {
    return NextResponse.json({ ok: false, error: "applicant_id and a valid stage are required" }, { status: 400 });
  }

  const result = await setDecision({
    applicant_id: body.applicant_id,
    stage: body.stage as Stage,
    decided_by: email,
    note: body.note,
  });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — decision not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
