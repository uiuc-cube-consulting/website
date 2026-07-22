import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { computeMetrics, isExec, STAGES } from "@/features/02-pipeline-crm/lib/pipeline";
import { getLeads } from "@/features/02-pipeline-crm/lib/store";

// Auth-gated, EXEC-BOARD ONLY pipeline feed. Reads the Supabase pipeline_leads store
// (demo data until configured). "Sync from outreach sheet" (POST .../import) pulls the
// bot's Leads tab into the store. Access via session.user.role (strike_system auth).

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isExec(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { leads, source } = await getLeads();
    const metrics = computeMetrics(leads);
    return NextResponse.json({ leads, metrics, stages: STAGES, source });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load pipeline" },
      { status: 500 }
    );
  }
}
