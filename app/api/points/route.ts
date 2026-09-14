import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase/server";
import {
  buildStandings,
  categoryTotals,
  totalFor,
  validateAward,
  type PointEntry,
  type RosterMember,
} from "@/lib/points";

export const dynamic = "force-dynamic";

const LEDGER_COLUMNS = "id, member_id, delta, reason, category, created_at, awarder:awarded_by ( full_name )";
const PRE_CATEGORY_COLUMNS = "id, member_id, delta, reason, created_at, awarder:awarded_by ( full_name )";

// Postgres "undefined column" on a read, and PostgREST's schema-cache miss for a
// column named in an insert. Either means the code is ahead of
// db/point-categories.sql, which is run by hand.
const UNDEFINED_COLUMN = "42703";
const UNKNOWN_INSERT_COLUMN = "PGRST204";

/**
 * Read the ledger with categories, or without them if the column isn't there
 * yet. Reading `category` from a table that lacks it fails the whole query, and
 * this query feeds the entire board, so a missing migration must cost the
 * breakdown, not the standings.
 */
async function readLedger(supabase: ReturnType<typeof createServerClient>) {
  const read = (columns: string) =>
    supabase.from("point_entries").select(columns).order("created_at", { ascending: false });

  const withCategories = await read(LEDGER_COLUMNS);
  if (withCategories.error?.code !== UNDEFINED_COLUMN) {
    return { data: withCategories.data, error: withCategories.error, categoriesMissing: false };
  }
  const legacy = await read(PRE_CATEGORY_COLUMNS);
  return { data: legacy.data, error: legacy.error, categoriesMissing: true };
}

/**
 * GET /api/points — the standings, with each member's category breakdown.
 *
 * Every non-exec member appears, including everyone on zero (see
 * lib/points.ts). Any signed-in member may read the board; it is the shared
 * leaderboard the club already ran in a Sheet. Category totals are part of the
 * standing, so they're public the same way the total is.
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

  const [{ data: members, error: mErr }, ledger] = await Promise.all([
    supabase.from("members").select("id, full_name, email, role"),
    readLedger(supabase),
  ]);

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  // The ledger is missing until db/points.sql is run. Report it plainly rather
  // than 500-ing: the roster is still worth showing, all on zero.
  if (ledger.error) {
    return NextResponse.json({
      rows: buildStandings((members ?? []) as RosterMember[], []),
      canAward: isExec,
      ledgerMissing: true,
      error: ledger.error.message,
    });
  }

  const all = (ledger.data ?? []) as unknown as (PointEntry & {
    awarder?: { full_name: string | null } | { full_name: string | null }[] | null;
  })[];

  const rows = buildStandings((members ?? []) as RosterMember[], all);

  // Exec get the full ledger; everyone else gets only their own.
  const visible = isExec ? all : all.filter((e) => e.member_id === memberId);

  return NextResponse.json({
    rows,
    canAward: isExec,
    categoriesMissing: ledger.categoriesMissing,
    entries: visible.map((e) => {
      const a = Array.isArray(e.awarder) ? e.awarder[0] : e.awarder;
      return {
        id: e.id,
        member_id: e.member_id,
        delta: e.delta,
        reason: e.reason,
        category: e.category ?? null,
        created_at: e.created_at,
        awarded_by_name: a?.full_name ?? null,
      };
    }),
  });
}

/**
 * POST /api/points — award (or deduct) points in a category. EXEC ONLY.
 *
 * body: { member_id, delta, reason, category: "fundamentals" | "professional" | "social" }
 *
 * Appends to the ledger rather than setting a total, so the board is always the
 * sum of explained changes and a mistake is corrected with an offsetting entry
 * in the same category rather than by overwriting history.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "exec") {
    return NextResponse.json({ error: "Only exec can award points." }, { status: 403 });
  }

  let body: { member_id?: unknown; delta?: unknown; reason?: unknown; category?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.member_id !== "string" || !body.member_id) {
    return NextResponse.json({ error: "member_id is required" }, { status: 400 });
  }
  const invalid = validateAward(body.delta, body.reason, body.category);
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
      category: body.category,
      awarded_by: session.user.memberId,
    })
    .select("id, member_id, delta, reason, category, created_at")
    .single();

  if (error) {
    // Refuse rather than retry without the category: an award that silently
    // lands uncategorized is exactly what this change exists to prevent.
    if (error.code === UNKNOWN_INSERT_COLUMN || error.code === UNDEFINED_COLUMN) {
      return NextResponse.json(
        { error: "Point categories aren't set up yet. Run db/point-categories.sql in Supabase, then try again." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The member's new standing, so the client doesn't need a second round trip.
  const { data: theirs } = await supabase
    .from("point_entries")
    .select("delta, category")
    .eq("member_id", body.member_id);
  const tally = (theirs ?? []) as Pick<PointEntry, "delta" | "category">[];

  return NextResponse.json(
    { ok: true, entry, total: totalFor(tally), categories: categoryTotals(tally).categories, name: target.full_name },
    { status: 201 }
  );
}
