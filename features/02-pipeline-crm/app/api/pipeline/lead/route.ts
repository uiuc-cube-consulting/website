import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isExec } from "@/features/02-pipeline-crm/lib/pipeline";
import { updateLead, type LeadPatch } from "@/features/02-pipeline-crm/lib/store";

// Exec-only: update one pipeline card — its stage (drag-to-restage) or any edited
// field (name/company/owner/industry/notes/custom/position).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isExec(session)) return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: { id?: string; patch?: LeadPatch };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.id || !body.patch) return NextResponse.json({ ok: false, error: "id and patch required" }, { status: 400 });

  const result = await updateLead(body.id, body.patch);
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — change not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
