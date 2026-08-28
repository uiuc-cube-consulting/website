import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildStandings,
  validateAward,
  type PointEntry,
  type RosterMember,
} from "@/lib/points";

export const dynamic = "force-dynamic";

/**
 * GET /api/points — the standings.
 *
 * Every non-exec member appears, including everyone on zero (see
 * lib/points.ts). Any signed-in member may read the board; it is the shared
 * leaderboard the club already ran in a Sheet.
 *
 * Individual awards are narrower than totals: exec see the whole ledger, and a
 * member sees only their own entries. A total is a public standing, but the
 * reason attached to an award ("missed the GM", "covered for X") is closer to
 * personnel notes and doesn't need to be readable across the roster.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId, role } = session.user;
  const isExec = role === "exec";
  const supabase = createServerClient();

  const [{ data: members, error: mErr }, { data: entries, error: eErr }] = await Promise.all([
    supabase.from("members").select("id, full_name, email, role"),
    supabase
      .from("point_entries")
      .select("id, member_id, delta, reason, created_at, awarder:awarded_by ( full_name )")
      .order("created_at", { ascending: false }),
  ]);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  // The ledger is missing until db/points.sql is run. Report it plainly rather
  // than 500-ing: the roster is still worth showing, all on zero.
  if (eErr) {
    return NextResponse.json({
      rows: buildStandings((members ?? []) as RosterMember[], []),
      canAward: isExec,
      ledgerMissing: true,
      error: eErr.message,
    });
  }

  const all = (entries ?? []) as unknown as (PointEntry & {
    awarder?: { full_name: string | null } | { full_name: string | null }[] | null;
  })[];

  const rows = buildStandings((members ?? []) as RosterMember[], all);

  // Exec get the full ledger; everyone else gets only their own.
  const visible = isExec ? all : all.filter((e) => e.member_id === memberId);

  return NextResponse.json({
    rows,
    canAward: isExec,
    entries: visible.map((e) => {
      const a = Array.isArray(e.awarder) ? e.awarder[0] : e.awarder;
      return {
        id: e.id,
        member_id: e.member_id,
        delta: e.delta,
        reason: e.reason,
        created_at: e.created_at,
        awarded_by_name: a?.full_name ?? null,
      };
    }),
  });
}

/**
 * POST /api/points — award (or deduct) points. EXEC ONLY.
 *
 * body: { member_id, delta, reason }
 *
 * Appends to the ledger rather than setting a total, so the board is always the
 * sum of explained changes and a mistake is corrected with an offsetting entry
 * rather than by overwriting history.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "exec") {
    return NextResponse.json({ error: "Only exec can award points." }, { status: 403 });
  }

  let body: { member_id?: unknown; delta?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.member_id !== "string" || !body.member_id) {
    return NextResponse.json({ error: "member_id is required" }, { status: 400 });
  }
  const invalid = validateAward(body.delta, body.reason);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const supabase = createServerClient();

  // Exec are deliberately not on the board, so awarding to one would create a
  // total nothing displays — a silent no-op from the user's point of view.
  const { data: target } = await supabase
    .from("members")
    .select("id, full_name, role")
    .eq("id", body.member_id)
    .single();
  if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });
  if (target.role === "exec") {
    return NextResponse.json(
      { error: "Exec aren't on the points board, so they can't be awarded points." },
      { status: 400 }
    );
  }

  const { data: entry, error } = await supabase
    .from("point_entries")
    .insert({
      member_id: body.member_id,
      delta: body.delta as number,
      reason: (body.reason as string).trim(),
      awarded_by: session.user.memberId,
    })
    .select("id, member_id, delta, reason, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The member's new standing, so the client doesn't need a second round trip.
  const { data: theirs } = await supabase
    .from("point_entries")
    .select("delta")
    .eq("member_id", body.member_id);
  const total = (theirs ?? []).reduce((s, r) => s + r.delta, 0);

  return NextResponse.json({ ok: true, entry, total, name: target.full_name }, { status: 201 });
}
