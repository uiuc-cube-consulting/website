import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { setPanel } from "@/features/03-recruitment-ats/lib/interview-store";

// Exec-only: set who is interviewing a candidate. This is what grants those
// interviewers the right to fill in that candidate's rubrics — and no one else's.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session?.user?.role !== "exec") {
    return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });
  }

  let body: { applicant_id?: string; interviewer_emails?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id) {
    return NextResponse.json({ ok: false, error: "applicant_id required" }, { status: 400 });
  }
  if (!Array.isArray(body.interviewer_emails)) {
    return NextResponse.json({ ok: false, error: "interviewer_emails must be an array" }, { status: 400 });
  }
  const emails = body.interviewer_emails.filter((e): e is string => typeof e === "string");

  const result = await setPanel({
    applicant_id: body.applicant_id,
    interviewer_emails: emails,
    assigned_by: email,
  });

  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — panel not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, panel: result.panel });
}
