import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { assignReviewers } from "@/features/03-recruitment-ats/lib/store";

// Exec-only: randomly + evenly assign k reviewers to every active applicant.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "exec") return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: { k?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* default k */
  }
  const k = Math.max(1, Math.min(5, Number(body.k) || 2));

  const result = await assignReviewers(k);
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — assignments not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
