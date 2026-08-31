import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { setDecision, getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { STAGES, type Stage } from "@/features/03-recruitment-ats/lib/types";
import { ROUND_STAGES } from "@/features/03-recruitment-ats/lib/rounds";
import { canDecide } from "@/features/03-recruitment-ats/lib/access";
import { resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { SELF_ACCESS_DENIED, excludeOwnApplications, isOwnApplication } from "@/features/03-recruitment-ats/lib/self-access";
import { isOwnApplicationId } from "@/features/03-recruitment-ats/lib/self-access-store";
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

  // You never decide your own application (lib/self-access.ts). This route is
  // already exec-only, which is exactly why the check is needed: the one person
  // who could reach this handler for their own row is an exec who applied in an
  // earlier cycle, and advancing yourself to `offer` is the single most damaging
  // thing anyone can do with this endpoint.
  if (await isOwnApplicationId(body.applicant_id, email)) {
    return NextResponse.json({ ok: false, error: SELF_ACCESS_DENIED }, { status: 403 });
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
 * EXEC-ONLY: the WRITTEN round's decision queue — every candidate still in the
 * written round, with their written reviews UNBLINDED.
 *
 * The reviewer feed at /api/recruitment/applicants deliberately hides other
 * reviewers' scores and notes so the screen stays blind. That protection has
 * served its purpose once both reads are in, and exec needs the opposite: both
 * verdicts side by side, and a flag where they disagree. Hence a separate
 * exec-only route rather than loosening the reviewer feed.
 *
 * This queue is where the written round ends: advancing from here puts a
 * candidate into the first round. The later two rounds are decided from the
 * interview console, in front of the rubrics that justify the call, rather than
 * from a second copy of this list.
 *
 * `?applicant_id=` asks a different question: ONE candidate's verdicts at ANY
 * stage, including the ones this queue has already emptied out. The queue is a
 * work list, so a candidate leaves it the moment they are rejected or advanced —
 * which is exactly when the reads become the answer to "why?". A rejected
 * applicant emails asking for feedback weeks later and the two rubrics that
 * produced the call are the only honest thing to read from. Same unblinding,
 * same exec-only gate, same self-access refusal; only the stage filter differs.
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
  const applicantId = url.searchParams.get("applicant_id");

  try {
    // Scoped like the reviewer feed: decisions are made cohort by cohort, and a
    // queue mixing two would put candidates nobody is deciding on right now in
    // front of the ones exec is actually working.
    const cycle = await resolveCycle(url.searchParams.get("cycle"));
    const { applicants, reviews, flags, demo } = await getSnapshot(cycle);

    // One candidate, whatever stage they are at now. Deliberately NOT filtered to
    // the written round: the whole point of this branch is the people the queue
    // below has already dropped, so feedback can be given to somebody who was
    // rejected a month ago. It exposes no verdict exec could not already read
    // from the queue while the candidate was still in it — only for longer.
    //
    // Scoped to the resolved cycle like every other read here, so an id from one
    // cohort cannot quietly pull a row out of another.
    if (applicantId) {
      const applicant = applicants.find((a) => a.id === applicantId);
      if (!applicant) {
        return NextResponse.json({ error: "No such candidate in this cycle" }, { status: 404 });
      }
      // The strongest case for the self-access rule in the whole app: this is the
      // one payload that hands somebody both readers' marks and both sets of
      // notes about a single person. No exec bypass (lib/self-access.ts).
      if (isOwnApplication(email, applicant.email)) {
        return NextResponse.json({ error: SELF_ACCESS_DENIED }, { status: 403 });
      }
      const [row] = buildDecisionQueue([applicant], reviews, undefined, flags);
      return NextResponse.json({ row, cycle, demo });
    }

    // Only the written round. Candidates who have already been advanced are being
    // worked in the interview console now, and terminal ones are dealt with —
    // both would bury the decisions that are actually outstanding.
    const active = applicants.filter((a) =>
      (ROUND_STAGES.written as readonly string[]).includes(a.stage)
    );

    // This queue is deliberately UNBLINDED — both reviewers' point totals and
    // both sets of written notes, side by side. That makes it the single worst
    // row in the app to hand somebody about themselves, so the self-access rule
    // (lib/self-access.ts) applies here more than anywhere: an exec who applied
    // in an earlier cycle would otherwise read exactly what their now-teammates
    // wrote about them while deciding.
    const mine = excludeOwnApplications(email, active, (a) => a.email);

    const rows = sortDecisionQueue(buildDecisionQueue(mine, reviews, undefined, flags), order);
    const visible = readyOnly ? rows.filter((r) => r.ready) : rows;

    return NextResponse.json({
      rows: visible,
      summary: summarizeQueue(rows),
      cycle,
      demo,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load the decision queue" },
      { status: 500 }
    );
  }
}
