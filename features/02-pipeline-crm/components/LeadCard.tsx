import type { Lead } from "@/features/02-pipeline-crm/lib/pipeline";

const SOURCE_STYLES: Record<string, string> = {
  apollo: "bg-blue-100 text-blue-800",
  prospects: "bg-emerald-100 text-emerald-800",
  alumni: "bg-amber-100 text-amber-900",
  inbound: "bg-violet-100 text-violet-800",
  unknown: "bg-[var(--bg-cream)] text-[var(--muted)]",
};

function lastTouch(lead: Lead): string | undefined {
  return lead.lastContacted || lead.shippedAt || lead.activeAt || lead.loiAt || lead.callAt || lead.repliedAt || lead.contactedAt;
}

export function LeadCard({ lead }: { lead: Lead }) {
  const source = lead.source || "unknown";
  const touch = lastTouch(lead);
  return (
    <article className="rounded-xl border border-[var(--border)] bg-white p-3.5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-[15px] font-bold leading-tight text-[var(--bg-dark)]">{lead.company}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SOURCE_STYLES[source] ?? SOURCE_STYLES.unknown}`}>
          {source}
        </span>
      </div>
      {lead.name && lead.name !== lead.company && (
        <p className="mt-0.5 text-[13px] text-[var(--muted)]">{lead.name}</p>
      )}
      {lead.industry && (
        <p className="mt-2 inline-block rounded-md bg-[var(--bg-cream)] px-2 py-0.5 text-[11px] text-[var(--bg-dark)]/70">{lead.industry}</p>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
        <span className="truncate">{lead.owner || "Unassigned"}</span>
        {touch && <span className="shrink-0 tabular-nums">{touch}</span>}
      </div>
    </article>
  );
}
