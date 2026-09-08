import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  provisionCandidateFolders,
  ASSET_KINDS,
  type AssetKind,
} from "@/features/03-recruitment-ats/lib/provision-store";
import { isInterviewRound } from "@/features/03-recruitment-ats/lib/rounds";

// Exec-only: read the Google Form response sheet and give every candidate in an
// interview round a Drive folder holding that round's rubrics — the first round's
// resume, case and behavioral rubrics and notes doc, or the final round's
// second-round rubric.
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
    round?: unknown;
    sheetId?: string;
    range?: string;
    cycle?: string;
    rootFolderId?: string;
    repair?: boolean;
    limit?: number;
    kinds?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* body is optional — fall back to env */
  }

  // An unrecognised round is refused rather than defaulted to the first: silently
  // provisioning the wrong round would build a second tree under the wrong name
  // and point the wrong applicant column at it.
  if (body.round !== undefined && !isInterviewRound(body.round)) {
    return NextResponse.json(
      { ok: false, error: "round must be first_round or final_round" },
      { status: 400 }
    );
  }

  // Unrecognised kinds are dropped rather than defaulted away: a typo'd
  // ["resumes"] must not silently become "provision everything", which would
  // create the rubric docs the caller was trying to exclude.
  let kinds: AssetKind[] | undefined;
  if (Array.isArray(body.kinds)) {
    kinds = body.kinds.filter((k): k is AssetKind =>
      (ASSET_KINDS as readonly string[]).includes(k as string)
    );
    if (!kinds.length) {
      return NextResponse.json(
        { ok: false, error: `kinds must name at least one of: ${ASSET_KINDS.join(", ")}` },
        { status: 400 }
      );
    }
  }

  const result = await provisionCandidateFolders({
    round: body.round,
    sheetId: body.sheetId,
    range: body.range,
    cycle: body.cycle,
    rootFolderId: body.rootFolderId,
    repair: Boolean(body.repair),
    limit: typeof body.limit === "number" ? body.limit : undefined,
    kinds,
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
