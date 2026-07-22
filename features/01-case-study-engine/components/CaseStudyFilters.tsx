"use client";

import type { Facets, SortKey } from "@/features/01-case-study-engine/lib/case-studies";
import { SORT_OPTIONS } from "@/features/01-case-study-engine/lib/case-studies";

type Props = {
  facets: Facets;
  query: string;
  onQuery: (v: string) => void;
  areas: string[];
  onToggleArea: (area: string) => void;
  term: string;
  onTerm: (v: string) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  onClear: () => void;
  resultCount: number;
  activeFilterCount: number;
};

const selectClass =
  "rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--bg-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]";

export function CaseStudyFilters({
  facets,
  query,
  onQuery,
  areas,
  onToggleArea,
  term,
  onTerm,
  sort,
  onSort,
  onClear,
  resultCount,
  activeFilterCount,
}: Props) {
  return (
    <div className="rounded-3xl border border-[var(--border)] bg-white/70 p-5 md:p-6">
      {/* Search */}
      <div className="relative">
        <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search clients, deliverables, keywords…"
          aria-label="Search case studies"
          className="w-full rounded-full border border-[var(--border)] bg-white py-3 pl-11 pr-4 text-[15px] text-[var(--bg-dark)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
        />
      </div>

      {/* Practice-area chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {facets.practiceAreas.map(({ area, count }) => {
          const active = areas.includes(area);
          return (
            <button
              key={area}
              type="button"
              onClick={() => onToggleArea(area)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--bg-dark)]"
                  : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--gold)]"
              }`}
            >
              {area}
              <span className={active ? "text-[var(--bg-dark)]/60" : "text-[var(--muted)]"}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Term + sort + result count */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select aria-label="Filter by term" className={selectClass} value={term} onChange={(e) => onTerm(e.target.value)}>
          <option value="all">All terms</option>
          {facets.terms.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select aria-label="Sort" className={selectClass} value={sort} onChange={(e) => onSort(e.target.value as SortKey)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--bg-dark)]"
          >
            <span aria-hidden>×</span> Clear filters
          </button>
        )}

        <span className="ml-auto text-sm text-[var(--muted)]">
          {resultCount} {resultCount === 1 ? "engagement" : "engagements"}
        </span>
      </div>
    </div>
  );
}
