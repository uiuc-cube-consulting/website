import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { setDecision, getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { STAGES, type Stage } from "@/features/03-recruitment-ats/lib/types";
import { canDecide } from "@/features/03-recruitment-ats/lib/access";
import {
  buildDecisionQueue,
  sortDecisionQueue,
  summarizeQueue,
  type QueueOrder,
} from "@/features/03-recruitment-ats/lib/decision";

// EXEC-ONLY: move an applicant to a new stage (advance / reject / etc.).
// Narrower than reviewing on purpose — a rejection reaches a real person, so it
// sits with the same people who control import and reviewer assignment.

export const dynamic = "force-dynamic";

const VALID: Stage[] = [...STAGES, "rejected", "withdrawn"];

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canDecide(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });
  }

  let body: { applicant_id?: string; stage?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.applicant_id || !body.stage || !VALID.includes(body.stage as Stage)) {
    return NextResponse.json({ ok: false, error: "applicant_id and a valid stage are required" }, { status: 400 });
  }

  const result = await setDecision({
    applicant_id: body.applicant_id,
    stage: body.stage as Stage,
    decided_by: email,
    note: body.note,
  });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — decision not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * EXEC-ONLY: the final-decision queue — every candidate with their written
 * reviews UNBLINDED.
 *
 * The reviewer feed at /api/recruitment/applicants deliberately hides other
 * reviewers' scores and notes so the screen stays blind. That protection has
 * served its purpose once both reads are in, and exec needs the opposite: both
 * verdicts side by side, and a flag where they disagree. Hence a separate
 * exec-only route rather than loosening the reviewer feed.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canDecide(session?.user?.role)) {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }

  const url = new URL(req.url);
  const order = (url.searchParams.get("order") ?? "score") as QueueOrder;
  const readyOnly = url.searchParams.get("ready") === "1";

  try {
    const { applicants, reviews, demo } = await getSnapshot();
    // Terminal candidates are already dealt with; showing them buries the work.
    const active = applicants.filter((a) => !["rejected", "withdrawn", "accepted"].includes(a.stage));

    const rows = sortDecisionQueue(buildDecisionQueue(active, reviews), order);
    const visible = readyOnly ? rows.filter((r) => r.ready) : rows;

    return NextResponse.json({
      rows: visible,
      summary: summarizeQueue(rows),
      demo,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load the decision queue" },
      { status: 500 }
    );
  }
}
