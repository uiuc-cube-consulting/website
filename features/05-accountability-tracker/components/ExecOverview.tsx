// Exec's cross-project read. Server component — it renders data the page already
// fetched, so there is no client request and no loading flash.

import Link from "next/link";
import { AlertTriangle, Check, Users } from "lucide-react";
import {
  CATEGORIES,
  type CategoryKey,
} from "@/features/05-accountability-tracker/lib/types";
import type { ProjectSummary } from "@/features/05-accountability-tracker/lib/store";

const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.short])
) as Record<CategoryKey, string>;

export function ExecOverview({ summaries }: { summaries: ProjectSummary[] }) {
  if (summaries.length === 0) {
    return (
      <p className="rounded-2xl border border-[var(--border)] bg-white px-5 py-10 text-center text-sm text-[var(--muted)]">
        No active projects yet. Add rows to <code>projects</code> and{" "}
        <code>project_members</code> — see <code>db/seed-projects-fa26.sql</code>.
      </p>
    );
  }

  // Everything flagged Below, newest first, across every project. This is the
  // list the QA lead actually acts on — the completion grid is bookkeeping.
  const allConcerns = summaries
    .flatMap((s) => s.concerns.map((c) => ({ ...c, project: s.project })))
    .sort((a, b) => b.week - a.week)
    .slice(0, 12);

  const behind = summaries.filter((s) => !s.complete || s.missedWeeks.length > 0);

  return (
    <div className="space-y-12">
      <section>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-display font-bold text-xl text-[var(--bg-dark)]">
            This week across {summaries.length} project{summaries.length === 1 ? "" : "s"}
          </h2>
          {behind.length > 0 && (
            <p className="text-sm text-[var(--muted)]">
              {behind.length} need{behind.length === 1 ? "s" : ""} chasing
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summaries.map((s) => (
            <Link
              key={s.project.id}
              href={`/portal/accountability?project=${s.project.id}`}
              className="group rounded-2xl border border-[var(--border)] bg-white p-5 hover:border-[var(--gold)] hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-bold text-[var(--bg-dark)] truncate">
                    {s.project.name}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)] flex items-center gap-1.5">
                    <Users size={12} />
                    {s.consultantCount} consultant{s.consultantCount === 1 ? "" : "s"}
                    {s.raters.length > 0 && (
                      <> · {s.raters.map((r) => r.full_name.split(/\s+/)[0]).join(" & ")}</>
                    )}
                  </p>
                </div>
                {s.complete ? (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                    <Check size={12} />
                    Week {s.currentWeek}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-[var(--bg-cream)] px-2.5 py-1 text-[11px] font-semibold text-[var(--gold-deep)]">
                    {s.filled}/{s.total} · Wk {s.currentWeek}
                  </span>
                )}
              </div>

              <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-cream)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    s.complete ? "bg-emerald-500" : "bg-[var(--gold)]"
                  }`}
                  style={{ width: `${s.total ? Math.round((s.filled / s.total) * 100) : 0}%` }}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                {s.missedWeeks.length > 0 && (
                  <span className="text-amber-700">
                    Week{s.missedWeeks.length === 1 ? "" : "s"} {s.missedWeeks.join(", ")} never
                    completed
                  </span>
                )}
                {s.concerns.length > 0 && (
                  <span className="text-red-700 font-medium">
                    {s.concerns.length} Below rating{s.concerns.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display font-bold text-xl text-[var(--bg-dark)] mb-1 flex items-center gap-2">
          <AlertTriangle size={18} className="text-amber-600" />
          Flagged this semester
        </h2>
        <p className="text-sm text-[var(--muted)] mb-4">
          Every <strong>Below</strong> rating, newest first. A pattern here is what a strike or a
          1:1 should be built on.
        </p>

        {allConcerns.length === 0 ? (
          <p className="rounded-2xl border border-[var(--border)] bg-white px-5 py-8 text-center text-sm text-[var(--muted)]">
            Nothing flagged. Every consultant is meeting or exceeding.
          </p>
        ) : (
          <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
            <ul className="divide-y divide-[var(--border)]">
              {allConcerns.map((c) => (
                <li
                  key={`${c.project.id}-${c.member_id}-${c.week}-${c.category}`}
                  className="px-5 py-3.5 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--bg-dark)] text-sm">
                      {c.full_name}
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        {c.project.name} · Week {c.week}
                      </span>
                    </p>
                    {c.note && (
                      <p className="mt-1 text-[13px] text-[var(--muted)] leading-relaxed">
                        &ldquo;{c.note}&rdquo;
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                    {CATEGORY_LABEL[c.category]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
