import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncResumes } from "@/features/03-recruitment-ats/lib/interview-store";

// Exec-only: scan the Drive resume folder and link every file to its applicant.
//
// Idempotent — safe to re-run whenever more resumes land in the folder. The folder
// can be passed in the body or left to RECRUITING_RESUME_FOLDER_ID.

export const dynamic = "force-dynamic";
// A cohort's worth of Drive metadata plus a bulk upsert; give it room.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "exec") return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: { folderId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* body is optional — fall back to env */
  }

  const folderId = (body.folderId || process.env.RECRUITING_RESUME_FOLDER_ID || "").trim();
  if (!folderId) {
    return NextResponse.json(
      { ok: false, error: "No resume folder. Paste a Drive folder URL, or set RECRUITING_RESUME_FOLDER_ID." },
      { status: 400 }
    );
  }

  const result = await syncResumes(folderId);
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — resumes not linked." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
