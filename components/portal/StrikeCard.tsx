import { weightLabel, deriveModification } from "@/lib/strikes";
import type { StrikeRow } from "@/lib/strikes";

type StatusBadgeProps = { status: string; effectiveType?: string | null };

export function StatusBadge({ status, effectiveType }: StatusBadgeProps) {
  let label = "";
  let cls = "";

  if (status === "pending") {
    label = "Pending";
    cls = "bg-yellow-50 text-yellow-700 border-yellow-200";
  } else if (status === "denied") {
    label = "Denied";
    cls = "bg-red-50 text-red-700 border-red-200";
  } else if (status === "approved") {
    if (effectiveType === "voided") {
      label = "Voided";
      cls = "bg-slate-100 text-slate-600 border-slate-200";
    } else {
      label = "Approved";
      cls = "bg-green-50 text-green-700 border-green-200";
    }
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// Strike row for member's own view (no filer/reviewer)
type OwnStrikeRowProps = {
  strike: Pick<StrikeRow, "id" | "strike_type" | "effective_type" | "reason" | "status" | "created_at">;
};

export function OwnStrikeRow({ strike }: OwnStrikeRowProps) {
  const date = new Date(strike.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-cream)]/30">
      <td className="px-5 py-4 text-sm text-[var(--muted)]">{date}</td>
      <td className="px-5 py-4 text-sm font-medium text-[var(--bg-dark)]">
        {strike.effective_type === "voided" ? "—" : weightLabel(strike.effective_type)}
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={strike.status} effectiveType={strike.effective_type} />
      </td>
      <td className="px-5 py-4 text-sm text-[var(--muted)] max-w-xs truncate">{strike.reason}</td>
    </tr>
  );
}

// Strike row for PM/SC view of strikes they filed
type FiledStrikeRowProps = {
  strike: Pick<StrikeRow, "id" | "strike_type" | "effective_type" | "reason" | "status" | "created_at"> & {
    member?: { full_name: string; email: string } | null;
  };
};

export function FiledStrikeRow({ strike }: FiledStrikeRowProps) {
  const date = new Date(strike.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const mod = deriveModification(strike);
  const originalWeight = weightLabel(strike.strike_type);
  const effectiveWeight = strike.effective_type === "voided" ? "Voided" : weightLabel(strike.effective_type);

  return (
    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-cream)]/30">
      <td className="px-5 py-4 text-sm font-medium text-[var(--bg-dark)]">
        {strike.member?.full_name ?? "—"}
      </td>
      <td className="px-5 py-4 text-sm text-[var(--muted)]">{originalWeight}</td>
      <td className="px-5 py-4 text-sm text-[var(--muted)]">
        {mod !== "unmodified" ? (
          <span className="italic">{effectiveWeight}</span>
        ) : (
          effectiveWeight
        )}
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={strike.status} effectiveType={strike.effective_type} />
      </td>
      <td className="px-5 py-4 text-sm text-[var(--muted)]">{date}</td>
      <td className="px-5 py-4 text-sm text-[var(--muted)] max-w-xs truncate">{strike.reason}</td>
    </tr>
  );
}

// Strike row for exec full view
type ExecStrikeRowProps = {
  strike: Pick<StrikeRow, "id" | "strike_type" | "effective_type" | "reason" | "status" | "created_at"> & {
    member?: { full_name: string; email: string } | null;
    filer?: { full_name: string; email: string } | null;
  };
};

export function ExecStrikeRow({ strike }: ExecStrikeRowProps) {
  const date = new Date(strike.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-cream)]/30">
      <td className="px-5 py-4 text-sm font-medium text-[var(--bg-dark)]">
        {strike.member?.full_name ?? "—"}
      </td>
      <td className="px-5 py-4 text-sm text-[var(--muted)]">{strike.filer?.full_name ?? "—"}</td>
      <td className="px-5 py-4 text-sm text-[var(--muted)]">
        {strike.effective_type === "voided" ? "Voided" : weightLabel(strike.effective_type ?? strike.strike_type)}
      </td>
      <td className="px-5 py-4">
        <StatusBadge status={strike.status} effectiveType={strike.effective_type} />
      </td>
      <td className="px-5 py-4 text-sm text-[var(--muted)]">{date}</td>
      <td className="px-5 py-4">
        <a
          href={`/portal/strikes/${strike.id}`}
          className="text-xs font-semibold text-[var(--gold-deep)] hover:underline"
        >
          View
        </a>
      </td>
    </tr>
  );
}
