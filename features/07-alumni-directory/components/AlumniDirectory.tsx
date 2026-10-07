"use client";

import { useMemo, useState } from "react";
import {
  CAMPUS_LABEL,
  filterAlumni,
  getFacets,
  SORT_OPTIONS,
  type Alumnus,
  type CampusStatus,
  type Field,
  type SortKey,
} from "@/features/07-alumni-directory/lib/alumni";
import { AlumniCard } from "./AlumniCard";
import { AlumniEditor } from "./AlumniEditor";

const selectClass =
  "rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--bg-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]";

const STATUS_TABS: (CampusStatus | "all")[] = ["all", "on_campus", "off_campus", "unknown"];

/**
 * Search + filters + card grid over the whole directory. Filtering is all
 * client-side: a couple hundred rows, so it's instant.
 *
 * Exec additionally get Add / Edit, which write through /api/alumni and patch
 * the local list from the response rather than reloading the page.
 */
export function AlumniDirectory({ initialAlumni, isExec }: { initialAlumni: Alumnus[]; isExec: boolean }) {
  const [alumni, setAlumni] = useState(initialAlumni);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CampusStatus | "all">("all");
  const [fields, setFields] = useState<Field[]>([]);
  const [company, setCompany] = useState("");
  const [mentorsOnly, setMentorsOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("name");
  // `null` = closed, "new" = adding, an Alumnus = editing that one.
  const [editing, setEditing] = useState<Alumnus | "new" | null>(null);

  const facets = useMemo(() => getFacets(alumni), [alumni]);
  const filtered = useMemo(
    () => filterAlumni(alumni, { query, status, fields, company, mentorsOnly, sort }),
    [alumni, query, status, fields, company, mentorsOnly, sort]
  );

  const activeFilterCount =
    (query.trim() ? 1 : 0) + (status !== "all" ? 1 : 0) + fields.length + (company ? 1 : 0) + (mentorsOnly ? 1 : 0);

  function clear() {
    setQuery("");
    setStatus("all");
    setFields([]);
    setCompany("");
    setMentorsOnly(false);
  }

  function toggleField(field: Field) {
    setFields((cur) => (cur.includes(field) ? cur.filter((f) => f !== field) : [...cur, field]));
  }

  function onSaved(row: Alumnus) {
    setAlumni((cur) => (cur.some((a) => a.id === row.id) ? cur.map((a) => (a.id === row.id ? row : a)) : [...cur, row]));
    setEditing(null);
  }

  function onDeleted(id: string) {
    setAlumni((cur) => cur.filter((a) => a.id !== id));
    setEditing(null);
  }

  const stats = [
    { value: facets.total, label: "Alumni" },
    { value: facets.status.on_campus, label: "Still on campus" },
    { value: facets.status.off_campus, label: "Working / grad school" },
    { value: facets.mentors, label: "Open to mentoring" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)] px-5 py-4">
            <div className="font-display text-3xl font-extrabold text-[var(--bg-dark)]">{s.value}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-3xl border border-[var(--border)] bg-white/70 p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, companies, roles, majors…"
              aria-label="Search alumni"
              className="w-full rounded-full border border-[var(--border)] bg-white py-3 pl-11 pr-4 text-[15px] text-[var(--bg-dark)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            />
          </div>
          {isExec && (
            <button type="button" onClick={() => setEditing("new")} className="btn btn-gold shrink-0">
              + Add alum
            </button>
          )}
        </div>

        {/* Where they are: the filter the directory exists for. */}
        <div role="group" aria-label="Where they are" className="mt-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((s) => {
            const active = status === s;
            const count = s === "all" ? facets.total : facets.status[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "border-[var(--bg-dark)] bg-[var(--bg-dark)] text-[var(--fg-on-dark)]"
                    : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--bg-dark)]"
                }`}
              >
                {s === "all" ? "Everyone" : CAMPUS_LABEL[s]}
                <span className={active ? "text-[var(--fg-on-dark)]/60" : "text-[var(--muted)]"}>{count}</span>
              </button>
            );
          })}
        </div>

        <div role="group" aria-label="Field of study" className="mt-3 flex flex-wrap gap-2">
          {facets.fields.map(({ field, count }) => {
            const active = fields.includes(field);
            return (
              <button
                key={field}
                type="button"
                onClick={() => toggleField(field)}
                aria-pressed={active}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-[var(--gold)] bg-[var(--gold)] text-[var(--bg-dark)]"
                    : "border-[var(--border)] bg-white text-[var(--bg-dark)] hover:border-[var(--gold)]"
                }`}
              >
                {field}
                <span className={active ? "text-[var(--bg-dark)]/60" : "text-[var(--muted)]"}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select aria-label="Filter by company" className={selectClass} value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">Any company</option>
            {facets.companies.map(({ company: c, count }) => (
              <option key={c} value={c}>
                {c} ({count})
              </option>
            ))}
          </select>

          <select aria-label="Sort" className={selectClass} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--bg-dark)]">
            <input
              type="checkbox"
              checked={mentorsOnly}
              onChange={(e) => setMentorsOnly(e.target.checked)}
              className="h-4 w-4 accent-[var(--gold-deep)]"
            />
            Open to mentoring
          </label>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--muted)] transition-colors hover:text-[var(--bg-dark)]"
            >
              <span aria-hidden>×</span> Clear filters
            </button>
          )}

          <span className="ml-auto text-sm text-[var(--muted)]" aria-live="polite">
            {filtered.length} {filtered.length === 1 ? "alum" : "alumni"}
          </span>
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((a) => (
            <AlumniCard key={a.id} alumnus={a} onEdit={isExec ? () => setEditing(a) : undefined} />
          ))}
        </div>
      ) : (
        <div className="mt-12 rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
          <p className="font-display text-xl font-bold text-[var(--bg-dark)]">
            {alumni.length ? "No matching alumni" : "No alumni yet"}
          </p>
          <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
            {alumni.length ? "Try a broader search or remove a filter." : "Exec can add alumni here, or load them with the import script."}
          </p>
          {alumni.length > 0 && (
            <button type="button" onClick={clear} className="btn btn-gold-outline mt-6">
              Clear filters
            </button>
          )}
        </div>
      )}

      {editing && (
        <AlumniEditor
          alumnus={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
