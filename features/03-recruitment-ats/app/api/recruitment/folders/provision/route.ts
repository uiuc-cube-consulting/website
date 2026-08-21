import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { provisionCandidateFolders } from "@/features/03-recruitment-ats/lib/provision-store";

// Exec-only: read the Google Form response sheet and give every candidate a Drive
// folder holding their resume, both interview rubrics, and a notes doc.
//
// Idempotent — safe to re-run whenever more applications land. Everything can be
// left to env vars; the body only exists so exec can point a run at a different
// sheet or cycle without a redeploy.

export const dynamic = "force-dynamic";
// A cohort's worth of Drive writes: ~5 API calls per candidate, four in flight.
// Well past the default 60s for a large cycle.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "exec") return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: {
    sheetId?: string;
    range?: string;
    cycle?: string;
    rootFolderId?: string;
    repair?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* body is optional — fall back to env */
  }

  const result = await provisionCandidateFolders({
    sheetId: body.sheetId,
    range: body.range,
    cycle: body.cycle,
    rootFolderId: body.rootFolderId,
    repair: Boolean(body.repair),
  });

  if (!result.ok && "demo" in result) {
    return NextResponse.json({
      ok: false,
      demo: true,
      message: "Supabase not configured — no folders were provisioned.",
    });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json(result);
}
