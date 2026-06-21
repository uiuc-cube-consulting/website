import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { computeMetrics, STAGES } from "@/features/02-pipeline-crm/lib/pipeline";
import { fetchPipeline } from "@/features/02-pipeline-crm/lib/source";

// Auth-gated, EXEC-BOARD ONLY pipeline feed.
//
// Authorization uses `session.user.role` from the strike_system PR's auth.ts (which
// loads each member's role from the Supabase `members` table). We do NOT define our
// own members table / Supabase client — that foundation belongs to strike_system.
//
// Pre-merge fallback (before auth is role-aware): PIPELINE_EXEC_ALLOWLIST env, or
// dev-open when nothing is configured. To grant non-exec members later, allow more
// roles here (mirrors strike_system's STRIKE_ROLES pattern).

export const dynamic = "force-dynamic";

type SessionLike = { user?: { email?: string | null; role?: string } } | null;

function isExec(session: SessionLike): boolean {
  const role = session?.user?.role;
  if (role) return role === "exec"; // strike_system auth is live
  // Fallback until the role-aware auth.ts lands:
  const allow = (process.env.PIPELINE_EXEC_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = session?.user?.email?.toLowerCase();
  if (allow.length) return Boolean(email && allow.includes(email));
  return true; // fully unconfigured → open for local dev (board shows demo data)
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isExec(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { leads, source } = await fetchPipeline();
    const metrics = computeMetrics(leads);
    return NextResponse.json({ leads, metrics, stages: STAGES, source });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load pipeline" },
      { status: 500 }
    );
  }
}
