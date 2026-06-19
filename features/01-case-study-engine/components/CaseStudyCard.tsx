"use client";

import { useState } from "react";
import type { CaseStudy } from "@/features/01-case-study-engine/lib/case-studies";

/**
 * A single case-study card. Matches the site's project cards (cream surface, gold
 * accents, rounded-3xl) but tuned for a dense, scannable library grid.
 */
export function CaseStudyCard({ study }: { study: CaseStudy }) {
  const [expanded, setExpanded] = useState(false);
  const long = study.summary.length > 180;

  return (
    <article className="flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--bg-cream)] p-6 md:p-7 transition-shadow hover:shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
          {study.termLabel || study.semester}
        </span>
        {study.repeatClient && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-dark)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fg-on-dark)]">
            <span aria-hidden>↻</span>
            {study.engagements}× repeat client
          </span>
        )}
      </div>

      <h3 className="mt-3 font-display text-2xl font-extrabold leading-tight text-[var(--bg-dark)]">
        {study.name}
      </h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {study.practiceAreas.map((area) => (
          <span
            key={area}
            className="rounded-full border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-2.5 py-1 text-[12px] font-medium text-[var(--gold-deep)]"
          >
            {area}
          </span>
        ))}
      </div>

      <p
        className={`mt-4 text-[15px] leading-relaxed text-[var(--bg-dark)]/80 ${
          expanded || !long ? "" : "line-clamp-4"
        }`}
      >
        {study.summary}
      </p>

      <div className="mt-auto flex items-center gap-3 pt-3">
        {long && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-sm font-semibold text-[var(--gold-deep)] transition-colors hover:text-[var(--bg-dark)]"
            aria-expanded={expanded}
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
        {study.anonymized && (
          <span className="text-xs text-[var(--muted)]">Client anonymized</span>
        )}
      </div>
    </article>
  );
}
