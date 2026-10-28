export type StrikeRow = {
  id: string;
  member_id: string;
  filed_by: string;
  strike_type: "half" | "full";
  effective_type: "half" | "full" | "voided" | null;
  reason: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

export function computeStrikeTotal(
  rows: Pick<StrikeRow, "effective_type" | "status">[]
): number {
  return rows.reduce((sum, r) => {
    if (r.status !== "approved") return sum;
    if (r.effective_type === "full") return sum + 1;
    if (r.effective_type === "half") return sum + 0.5;
    return sum;
  }, 0);
}

export function strikeLabel(total: number): string {
  if (total === 0.5) return "Half Strike";
  if (total === 1) return "1st Strike";
  if (total === 1.5) return "1.5 Strikes";
  if (total === 2) return "2nd Strike";
  if (total === 2.5) return "2.5 Strikes";
  if (total === 3) return "3rd Strike";
  return `${total} Strikes`;
}

export function weightLabel(w: "half" | "full" | "voided" | null): string {
  if (w === "half") return "Half Strike";
  if (w === "full") return "Full Strike";
  if (w === "voided") return "Voided";
  return "—";
}

export type StrikeModification = "voided" | "downgraded" | "upgraded" | "unmodified";

export function deriveModification(row: Pick<StrikeRow, "strike_type" | "effective_type">): StrikeModification {
  if (row.effective_type === "voided") return "voided";
  if (row.strike_type === "full" && row.effective_type === "half") return "downgraded";
  if (row.strike_type === "half" && row.effective_type === "full") return "upgraded";
  return "unmodified";
}

export const STRIKE_LEVELS = [0, 0.5, 1, 1.5, 2, 2.5, 3] as const;

export type StrikeBucket = {
  /** Strike total in half steps; 3 means 3 or more. */
  level: (typeof STRIKE_LEVELS)[number];
  members: { id: string; name: string; total: number }[];
};

/**
 * How many members sit at each strike level, for the exec overview. Built from
 * the roster so members with no strikes still count toward 0. Exec are left
 * out, the same as the points board. Every half step gets its own bucket, and
 * 3 means 3 or more, the same line the exec alert uses.
 */
export function strikeBreakdown(
  roster: { id: string; full_name: string | null; email: string; role: string }[],
  strikes: Pick<StrikeRow, "member_id" | "effective_type" | "status">[]
): StrikeBucket[] {
  const byMember = new Map<string, Pick<StrikeRow, "effective_type" | "status">[]>();
  for (const s of strikes) {
    const list = byMember.get(s.member_id) ?? [];
    list.push(s);
    byMember.set(s.member_id, list);
  }

  const buckets: StrikeBucket[] = STRIKE_LEVELS.map((level) => ({ level, members: [] }));
  for (const m of roster) {
    if (m.role === "exec") continue;
    const total = computeStrikeTotal(byMember.get(m.id) ?? []);
    // Totals are always whole or half, so doubling gives the bucket index
    const index = Math.min(Math.round(total * 2), buckets.length - 1);
    buckets[index].members.push({ id: m.id, name: m.full_name?.trim() || m.email, total });
  }
  for (const b of buckets) {
    b.members.sort((x, y) => y.total - x.total || x.name.localeCompare(y.name));
  }
  return buckets;
}
