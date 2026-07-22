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
