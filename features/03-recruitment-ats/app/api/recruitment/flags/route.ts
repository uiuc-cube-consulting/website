import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { submitFlag } from "@/features/03-recruitment-ats/lib/store";

// Auth-gated: any signed-in member can flag an applicant red or green. Append-only.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: { applicant_id?: string; color?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id) return NextResponse.json({ ok: false, error: "applicant_id required" }, { status: 400 });
  if (body.color !== "red" && body.color !== "green") {
    return NextResponse.json({ ok: false, error: "color must be red or green" }, { status: 400 });
  }
  const description = body.description?.trim() ?? "";
  if (!description) return NextResponse.json({ ok: false, error: "description is required" }, { status: 400 });

  const result = await submitFlag({
    applicant_id: body.applicant_id,
    submitter_email: email,
    color: body.color,
    description,
  });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — flag not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
