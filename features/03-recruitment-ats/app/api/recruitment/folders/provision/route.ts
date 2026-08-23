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
// 60 rather than 300: Vercel's Hobby plan caps functions at 60s and rejects a
// higher value outright. A cohort does not fit in one request at any ceiling
// (~8s of Drive/Docs work per candidate), so the work is chunked instead — each
// call provisions `limit` candidates and reports `remaining`, and the client
// keeps calling until it hits zero. The ledger makes that free.
export const maxDuration = 60;

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
    limit?: number;
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
    limit: typeof body.limit === "number" ? body.limit : undefined,
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
