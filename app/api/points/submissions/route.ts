import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { canSubmitPoints, cohortFor, emptyCategoryTotals, validateSubmission } from "@/lib/point-catalog";
import { decodeEvidence } from "@/lib/point-evidence";
import { createSubmission, ledgerCategoryTotals, listSubmissions } from "@/lib/point-submissions-store";

export const dynamic = "force-dynamic";

const NOT_SET_UP =
  "Point submissions aren't set up yet. Exec need to run db/point-submissions.sql in Supabase.";

/**
 * GET /api/points/submissions
 *
 * Exec get every submission (the review queue). Everyone else gets only their
 * own, plus their per-category ledger totals for the progress bars. A
 * submission carries a photo and a note about who the member met, which is not
 * something the rest of the roster needs to read.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId, role } = session.user;
  const isExec = role === "exec";
  const cohort = cohortFor(role);

  const [result, ledgerTotals] = await Promise.all([
    listSubmissions(isExec ? {} : { memberId }),
    isExec ? Promise.resolve(emptyCategoryTotals()) : ledgerCategoryTotals(memberId),
  ]);

  if (!result.ok) {
    if (result.missing) {
      return NextResponse.json({ rows: [], isExec, cohort, ledgerTotals, tableMissing: true });
    }
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ rows: result.rows, isExec, cohort, ledgerTotals });
}

/**
 * POST /api/points/submissions — submit an event for review.
 *
 * Open to project managers, senior consultants, returning members and members
 * (SUBMITTER_ROLES in lib/point-catalog.ts).
 *
 * body: { event_key, occurred_on: "YYYY-MM-DD", note?: string, photo: data URL }
 *
 * Only the event is taken from the request. Its category, label and points come
 * from the catalog, so a hand-edited request can't claim 50 points for a
 * resume review.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canSubmitPoints(session.user.role)) {
    // Exec aren't on the points board (lib/points.ts), so an approved
    // submission would add to a total nothing displays.
    const error =
      session.user.role === "exec"
        ? "Exec aren't on the points board, so there's nothing to submit points toward."
        : "Your role can't submit points.";
    return NextResponse.json({ error }, { status: 403 });
  }
  const memberId = session.user.memberId;

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object") throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const photo = decodeEvidence(body.photo);
  if (!photo.ok) return NextResponse.json({ error: photo.error }, { status: 400 });

  // Their own history, for the repeat limit.
  const existing = await listSubmissions({ memberId });
  if (!existing.ok) {
    return existing.missing
      ? NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
      : NextResponse.json({ error: existing.error }, { status: 500 });
  }

  const checked = validateSubmission(
    { event_key: body.event_key, occurred_on: body.occurred_on, note: body.note },
    existing.rows
  );
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });

  const created = await createSubmission(
    {
      member_id: memberId,
      category: checked.event.category,
      event_key: checked.event.key,
      event_label: checked.event.label,
      points: checked.event.points,
      occurred_on: checked.occurredOn,
      note: checked.note,
    },
    { bytes: photo.bytes, mime: photo.mime }
  );
  if (!created.ok) {
    return created.missing
      ? NextResponse.json({ error: NOT_SET_UP }, { status: 503 })
      : NextResponse.json({ error: created.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, submission: created.row }, { status: 201 });
}
