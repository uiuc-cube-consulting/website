import type { StrikeBucket } from "@/lib/strikes";

const LEVELS: Record<StrikeBucket["level"], { label: string; cls: string }> = {
  0: { label: "0 strikes", cls: "border-[var(--border)] bg-white" },
  0.5: { label: "½ strike", cls: "border-yellow-200 bg-yellow-50" },
  1: { label: "1 strike", cls: "border-yellow-200 bg-yellow-50" },
  1.5: { label: "1½ strikes", cls: "border-orange-200 bg-orange-50" },
  2: { label: "2 strikes", cls: "border-orange-200 bg-orange-50" },
  2.5: { label: "2½ strikes", cls: "border-red-200 bg-red-50" },
  3: { label: "3+ strikes", cls: "border-red-200 bg-red-50" },
};

// Exec-only overview of how many members sit at each strike level
export function StrikeBreakdown({ buckets }: { buckets: StrikeBucket[] }) {
  return (
    <section>
      <h2 className="font-display font-bold text-xl text-[var(--bg-dark)] mb-1">Members by strike count</h2>
      <p className="text-sm text-[var(--muted)] mb-4">Approved strikes only.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
        {buckets.map((b) => (
          <div key={b.level} className={`rounded-2xl border p-5 ${LEVELS[b.level].cls}`}>
            <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
              {LEVELS[b.level].label}
            </p>
            <p className="mt-2 font-display font-extrabold text-4xl text-[var(--bg-dark)]">{b.members.length}</p>
            {b.members.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-[var(--gold-deep)] hover:underline">
                  Show members
                </summary>
                <ul className="mt-2 space-y-1">
                  {b.members.map((m) => (
                    <li key={m.id} className="flex justify-between gap-2 text-sm text-[var(--bg-dark)]">
                      <span className="truncate">{m.name}</span>
                      {/* Only the 3+ bucket mixes totals, so show the exact one there */}
                      {b.level === 3 && <span className="text-[var(--muted)]">{m.total}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
