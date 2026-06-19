import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  canViewPipeline,
  computeMetrics,
  STAGES,
} from "@/features/02-pipeline-crm/lib/pipeline";
import { fetchPipeline } from "@/features/02-pipeline-crm/lib/source";

// Auth-gated pipeline feed for the portal board. Reads the outreach Sheet (or demo
// data when unconfigured), computes funnel metrics, and returns both. Restricted to
// the leadership allowlist when PIPELINE_ALLOWLIST is set.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewPipeline(email)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
