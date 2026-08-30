import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSnapshot, setDecisions } from "@/features/03-recruitment-ats/lib/store";
import { canDecide } from "@/features/03-recruitment-ats/lib/access";
import { ownApplicationIds, SELF_ACCESS_DENIED } from "@/features/03-recruitment-ats/lib/self-access";
import { resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { STAGES, type Stage } from "@/features/03-recruitment-ats/lib/types";

// EXEC-ONLY: move a set of applicants to the same stage in one action.
//
// The delibs-day case — exec works down a sorted queue and the bottom forty are
// all the same call. Doing that one at a time is slow enough that people batch
// it wrong: closing the tab halfway, or double-clicking and losing track of
// which actually went through.
//
// Same gate as the single-applicant route (`canDecide`, exec-only) and the same
// self-access rule. A bulk action is exactly where a self-rejection would slip
// through unnoticed, because nobody reads forty names before confirming — so
// the viewer's own applications are removed from the set and REPORTED, rather
// than silently dropped or silently applied.

export const dynamic = "force-dynamic";

const VALID: Stage[] = [...STAGES, "rejected", "withdrawn"];

/** A guard against a runaway client, not a policy limit. Nobody decides on more
 *  than a few hundred people at once deliberately; a payload larger than this is
 *  a bug somewhere upstream and should fail loudly rather than rewrite a cohort. */
const MAX_BATCH = 250;

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canDecide(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });
  }

  let body: { applicant_ids?: unknown; stage?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.applicant_ids) || body.applicant_ids.some((i) => typeof i !== "string")) {
    return NextResponse.json(
      { ok: false, error: "applicant_ids must be an array of strings" },
      { status: 400 }
    );
  }
  const requested = [...new Set((body.applicant_ids as string[]).filter(Boolean))];
  if (!requested.length) {
    return NextResponse.json({ ok: false, error: "Select at least one applicant." }, { status: 400 });
  }
  if (requested.length > MAX_BATCH) {
    return NextResponse.json(
      { ok: false, error: `Too many at once (${requested.length}). The limit is ${MAX_BATCH}.` },
      { status: 400 }
    );
  }
  if (!body.stage || !VALID.includes(body.stage as Stage)) {
    return NextResponse.json({ ok: false, error: "A valid stage is required" }, { status: 400 });
  }

  try {
    const { applicants } = await getSnapshot(await resolveCycle(null));
    const mine = ownApplicationIds(email, applicants);
    const ids = requested.filter((id) => !mine.has(id));
    const skippedSelf = requested.length - ids.length;

    // Refusing outright when the ONLY thing selected was your own application:
    // silently succeeding with nothing done would read as "it worked".
    if (!ids.length) {
      return NextResponse.json({ ok: false, error: SELF_ACCESS_DENIED }, { status: 403 });
    }

    const result = await setDecisions({
      applicant_ids: ids,
      stage: body.stage as Stage,
      decided_by: email,
      note: body.note,
    });
    if (result.demo) {
      return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — nothing changed." });
    }
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

    return NextResponse.json({
      ok: true,
      stage: body.stage,
      updated: result.updated ?? 0,
      // Reported rather than hidden: a count that quietly differs from what was
      // selected is how people lose track of which candidates were actually
      // decided on.
      ...(skippedSelf ? { skippedSelf } : {}),
      ...((result.updated ?? 0) < ids.length
        ? { notFound: ids.length - (result.updated ?? 0) }
        : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to apply the decisions" },
      { status: 500 }
    );
  }
}
