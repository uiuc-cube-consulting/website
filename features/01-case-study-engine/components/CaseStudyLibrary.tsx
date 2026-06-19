"use client";

import { useMemo, useState } from "react";
import type { CaseStudy, Facets, SortKey } from "@/features/01-case-study-engine/lib/case-studies";
import { filterCaseStudies } from "@/features/01-case-study-engine/lib/case-studies";
import { CaseStudyCard } from "./CaseStudyCard";
import { CaseStudyFilters } from "./CaseStudyFilters";

/**
 * Interactive case-study library: stats header, filter bar, and a responsive grid.
 * All filtering happens client-side over the full dataset (102 records is tiny),
 * so it's instant and the initial HTML is fully server-rendered for SEO.
 */
export function CaseStudyLibrary({ studies, facets }: { studies: CaseStudy[]; facets: Facets }) {
  const [query, setQuery] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [term, setTerm] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const filtered = useMemo(
    () => filterCaseStudies(studies, { query, areas, term, sort }),
    [studies, query, areas, term, sort]
  );

  const activeFilterCount =
    (query.trim() ? 1 : 0) + areas.length + (term !== "all" ? 1 : 0);

  function toggleArea(area: string) {
    setAreas((cur) => (cur.includes(area) ? cur.filter((a) => a !== area) : [...cur, area]));
  }

  function clear() {
    setQuery("");
    setAreas([]);
    setTerm("all");
  }

  const stats = [
    { value: facets.total, label: "Engagements" },
    { value: `${facets.distinctClients}+`, label: "Clients" },
    { value: facets.yearsActive, label: "Years of work" },
    { value: facets.practiceAreas.length, label: "Practice areas" },
  ];

  return (
    <div>
      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)] px-5 py-4">
            <div className="font-display text-3xl font-extrabold text-[var(--bg-dark)]">{s.value}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-6">
        <CaseStudyFilters
          facets={facets}
          query={query}
          onQuery={setQuery}
          areas={areas}
          onToggleArea={toggleArea}
          term={term}
          onTerm={setTerm}
          sort={sort}
          onSort={setSort}
          onClear={clear}
          resultCount={filtered.length}
          activeFilterCount={activeFilterCount}
        />
      </div>

      {/* Results */}
      {filtered.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((study) => (
            <CaseStudyCard key={study.id} study={study} />
          ))}
        </div>
      ) : (
        <div className="mt-12 rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
          <p className="font-display text-xl font-bold text-[var(--bg-dark)]">No matching engagements</p>
          <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
            Try a broader search or remove a filter.
          </p>
          <button
            type="button"
            onClick={clear}
            className="btn btn-gold-outline mt-6"
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
