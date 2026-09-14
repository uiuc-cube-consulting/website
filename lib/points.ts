// Points tracker — pure logic. No I/O, so the API route and the tests agree on
// what a total is and how the board is ordered.
//
// Points live as a ledger (db/points.sql): individual awards that sum to a
// total, mirroring how `strikes` works. A member with no entries has 0 points,
// which is why nothing needs seeding when the roster changes.
//
// Every award belongs to a category (fundamentals, professional or social;
// db/point-categories.sql), so each member's total also breaks down by
// category, and those per-category sums are what the requirements are met in.

import {
  POINT_CATEGORIES,
  emptyCategoryTotals,
  isPointCategory,
  type CategoryTotals,
  type PointCategory,
} from "@/lib/point-catalog";

/**
 * Exec run the tracker, so they don't appear on the board — and neither do the
 * shared officer mailboxes, which carry `role = 'exec'` for exactly this reason:
 * `hr@`, `coo@`, and `director@cubeconsulting.org` are positions rather than
 * people, and a leaderboard of individuals should not have a position on it.
 *
 * This is the single gate. Anything that must stay off the board has to be
 * `exec` in `members`; there is no second list to keep in step. The roster seed
 * protects that with `where members.role <> 'exec'`, so a refresh cannot demote
 * an officer account onto the board by accident.
 */
export const POINTS_EXCLUDED_ROLES = ["exec"] as const;

export type PointEntry = {
  id?: string;
  member_id: string;
  delta: number;
  reason: string;
  /** Null only on entries recorded before categories existed. Every new award has one. */
  category?: PointCategory | null;
  created_at?: string;
  awarded_by?: string | null;
  awarded_by_name?: string | null;
};

export type StandingsRow = {
  member_id: string;
  name: string;
  email: string;
  role: string;
  points: number;
  /** Points per category. Together with `uncategorized` these sum to `points`. */
  categories: CategoryTotals;
  /** Points from entries that predate categories. 0 on a ledger started after them. */
  uncategorized: number;
  /** How many awards make up the total — 0 for everyone at the start. */
  entries: number;
};

export type RosterMember = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

/** Who appears on the board: everyone except exec. */
export function isOnBoard(role: string): boolean {
  return !(POINTS_EXCLUDED_ROLES as readonly string[]).includes(role);
}

export function totalFor(entries: Pick<PointEntry, "delta">[]): number {
  return entries.reduce((sum, e) => sum + e.delta, 0);
}

/**
 * Split entries into per-category sums. An entry with no (or an unrecognised)
 * category goes to `uncategorized` rather than being dropped, so the breakdown
 * never silently disagrees with the total.
 */
export function categoryTotals(
  entries: Pick<PointEntry, "delta" | "category">[]
): { categories: CategoryTotals; uncategorized: number } {
  const categories = emptyCategoryTotals();
  let uncategorized = 0;
  for (const e of entries) {
    if (isPointCategory(e.category)) categories[e.category] += e.delta;
    else uncategorized += e.delta;
  }
  return { categories, uncategorized };
}

/**
 * Build the standings from the roster and the ledger.
 *
 * Driven by the ROSTER, not by the ledger: every non-exec member appears even
 * with no entries, which is what makes "everyone starts at 0" true without
 * inserting 34 zero rows. Ledger entries for someone no longer on the roster
 * (left the club) are ignored rather than resurrecting them onto the board.
 *
 * Ordered by points descending, then name — so a board where everyone is on
 * zero reads alphabetically instead of in whatever order Postgres returned.
 */
export function buildStandings(
  roster: RosterMember[],
  entries: Pick<PointEntry, "member_id" | "delta" | "category">[]
): StandingsRow[] {
  const byMember = new Map<string, Pick<PointEntry, "delta" | "category">[]>();
  for (const e of entries) {
    const list = byMember.get(e.member_id) ?? [];
    list.push(e);
    byMember.set(e.member_id, list);
  }

  return roster
    .filter((m) => isOnBoard(m.role))
    .map((m) => {
      const theirs = byMember.get(m.id) ?? [];
      const { categories, uncategorized } = categoryTotals(theirs);
      return {
        member_id: m.id,
        name: m.full_name?.trim() || m.email,
        email: m.email,
        role: m.role,
        points: totalFor(theirs),
        categories,
        uncategorized,
        entries: theirs.length,
      };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

/**
 * Competition ranking (1,2,2,4): members level on points share a rank.
 *
 * With everyone on zero that makes the whole board rank 1, which is honest —
 * numbering an all-zero board 1..34 would invent a standing that doesn't exist.
 */
export function withRanks(rows: StandingsRow[]): (StandingsRow & { rank: number })[] {
  return rows.map((row, i, all) => {
    if (i > 0 && all[i - 1].points === row.points) {
      // Same points as the row above → same rank. Walk back to find it.
      let j = i - 1;
      while (j > 0 && all[j - 1].points === row.points) j--;
      return { ...row, rank: j + 1 };
    }
    return { ...row, rank: i + 1 };
  });
}

export const MAX_DELTA = 1000;

/** Validate an award before it reaches the database. Mirrors the CHECK constraints. */
export function validateAward(delta: unknown, reason: unknown, category: unknown): string | null {
  if (typeof delta !== "number" || !Number.isInteger(delta)) return "Points must be a whole number.";
  if (delta === 0) return "Points must not be zero.";
  if (Math.abs(delta) > MAX_DELTA) return `Points must be between -${MAX_DELTA} and ${MAX_DELTA}.`;
  if (typeof reason !== "string" || !reason.trim()) return "A reason is required.";
  if (!isPointCategory(category)) {
    return `Pick a category: ${POINT_CATEGORIES.map((c) => c.label.toLowerCase()).join(", ")}.`;
  }
  return null;
}
