import { Clock, Target, TrendingUp, Trophy } from "lucide-react";
import type { PipelineMetrics as Metrics } from "@/features/02-pipeline-crm/lib/pipeline";

function Tile({ icon: Icon, value, label }: { icon: typeof Clock; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)] px-5 py-4">
      <div className="flex items-center gap-2 text-[var(--gold-deep)]">
        <Icon size={16} />
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</span>
      </div>
      <div className="mt-1.5 font-display text-3xl font-extrabold text-[var(--bg-dark)]">{value}</div>
    </div>
  );
}

export function PipelineMetrics({ metrics }: { metrics: Metrics }) {
  const maxReached = Math.max(1, ...metrics.stages.map((s) => s.reached));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Target} value={String(metrics.total)} label="In pipeline" />
        <Tile icon={TrendingUp} value={`${metrics.replyRate}%`} label="Reply rate" />
        <Tile icon={Trophy} value={`${metrics.winRate}%`} label="Win rate" />
        <Tile icon={Clock} value={metrics.avgDaysToLOI === null ? "—" : `${metrics.avgDaysToLOI}d`} label="Avg to LOI" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Funnel: how many leads reached each stage + conversion from the prior stage */}
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 lg:col-span-2">
          <p className="eyebrow">Funnel</p>
          <div className="mt-4 space-y-2.5">
            {metrics.stages.map((s) => (
              <div key={s.key} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[13px] text-[var(--bg-dark)]">{s.label}</span>
                <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--bg-cream)]">
                  <div
                    className="h-full rounded-md bg-[var(--gold)]/70"
                    style={{ width: `${Math.round((s.reached / maxReached) * 100)}%` }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-semibold text-[var(--bg-dark)]">
                    {s.reached}
                  </span>
                </div>
                <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-[var(--muted)]">
                  {s.conversionFromPrev === null ? "" : `${s.conversionFromPrev}%`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Win rate by lead source — tells the bot which Apollo profiles to weight */}
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <p className="eyebrow">By source</p>
          <div className="mt-4 space-y-3">
            {metrics.bySource.map((s) => (
              <div key={s.source} className="flex items-center justify-between gap-2 text-sm">
                <span className="capitalize text-[var(--bg-dark)]">{s.source}</span>
                <span className="text-[var(--muted)]">
                  <span className="font-semibold text-[var(--bg-dark)]">{s.won}</span>/{s.total}
                  <span className="ml-2 tabular-nums text-[var(--gold-deep)]">{s.winRate}%</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
