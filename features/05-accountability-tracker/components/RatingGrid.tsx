"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, MessageSquare, Wand2, X } from "lucide-react";
import {
  CATEGORIES,
  RATINGS,
  RATING_LABEL,
  weekCompletion,
  type CategoryKey,
  type Project,
  type ProjectMember,
  type Rating,
  type RatingRow,
} from "@/features/05-accountability-tracker/lib/types";
import { weekRangeLabel } from "@/features/05-accountability-tracker/lib/week";

type Cell = { rating: Rating | null; note: string };
type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  project: Project;
  consultants: ProjectMember[];
  ratings: RatingRow[];
  week: number;
  currentWeek: number;
  canRate: boolean;
  demo: boolean;
};

const key = (memberId: string, category: CategoryKey) => `${memberId}:${category}`;

function buildCells(consultants: ProjectMember[], ratings: RatingRow[]): Record<string, Cell> {
  const cells: Record<string, Cell> = {};
  for (const c of consultants) {
    for (const cat of CATEGORIES) {
      cells[key(c.member_id, cat.key)] = { rating: null, note: "" };
    }
  }
  for (const r of ratings) {
    const k = key(r.member_id, r.category);
    if (k in cells) cells[k] = { rating: r.rating, note: r.note ?? "" };
  }
  return cells;
}

export function RatingGrid(props: Props) {
  const { project, canRate, demo } = props;

  const [week, setWeek] = useState(props.week);
  const [consultants, setConsultants] = useState(props.consultants);
  const [cells, setCells] = useState<Record<string, Cell>>(() =>
    buildCells(props.consultants, props.ratings)
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<string | null>(null);
  const [loadingWeek, setLoadingWeek] = useState(false);

  // Cells changed since the last successful save. A ref, not state: the debounce
  // timer reads it at fire time and re-rendering must not reset it.
  const pending = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `flush` runs from a timer, long after render, and must see the latest cells
  // without being re-created on every keystroke (which would restart the
  // debounce and never save). Click handlers below read the render-scope
  // `cells` instead — that is already current for the click being handled.
  const cellsRef = useRef(cells);
  const weekRef = useRef(week);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);
  useEffect(() => {
    weekRef.current = week;
  }, [week]);

  const filled = useMemo(
    () => Object.values(cells).filter((c) => c.rating !== null).length,
    [cells]
  );
  const total = consultants.length * CATEGORIES.length;
  const remaining = total - filled;

  // ── Saving ────────────────────────────────────────────────────────────────

  const flush = useCallback(async () => {
    if (pending.current.size === 0) return;
    const batch = Array.from(pending.current);
    pending.current.clear();

    const snapshot = cellsRef.current;
    const savedWeek = weekRef.current;
    const payload = batch
      .map((k) => {
        const [member_id, category] = k.split(":") as [string, CategoryKey];
        const cell = snapshot[k];
        if (!cell?.rating) return null;
        return { member_id, category, rating: cell.rating, note: cell.note };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (payload.length === 0) return;

    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/accountability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: project.id, week: savedWeek, ratings: payload }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // Put them back so the next change (or Retry) tries again.
        batch.forEach((k) => pending.current.add(k));
        setStatus("error");
        setError(data.error || "Could not save. Your changes are still here — try again.");
        return;
      }
      setStatus("saved");
    } catch {
      batch.forEach((k) => pending.current.add(k));
      setStatus("error");
      setError("Network error. Your changes are still here — try again.");
    }
  }, [project.id]);

  const queue = useCallback(
    (keys: string[]) => {
      if (!canRate || demo) return;
      keys.forEach((k) => pending.current.add(k));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [canRate, demo, flush]
  );

  // Anything unsaved when the tab closes would be silently lost otherwise.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // ── Editing ───────────────────────────────────────────────────────────────

  function setRating(memberId: string, category: CategoryKey, rating: Rating) {
    const k = key(memberId, category);
    const cell = cells[k] ?? { rating: null, note: "" };
    // Clicking the selected value again is a no-op rather than a clear — there
    // is no "unrated" to go back to once a week has been filled in.
    if (cell.rating === rating) return;
    setCells((prev) => ({ ...prev, [k]: { ...(prev[k] ?? cell), rating } }));
    queue([k]);
  }

  function setNote(memberId: string, category: CategoryKey, note: string) {
    const k = key(memberId, category);
    setCells((prev) => ({ ...prev, [k]: { ...(prev[k] ?? { rating: null, note: "" }), note } }));
    // A note without a rating has nothing to attach to; it saves with the rating.
    if (cells[k]?.rating) queue([k]);
  }

  /**
   * The one-click path. Most weeks are all Meets with two exceptions, so filling
   * the blanks and letting the PM override a couple of cells is the difference
   * between a 20-second task and a 5-minute one. Deliberately only fills EMPTY
   * cells — it can never overwrite a considered rating.
   */
  function fillRemainingWithMeets() {
    const touched = consultants.flatMap((c) =>
      CATEGORIES.map((cat) => key(c.member_id, cat.key)).filter((k) => !cells[k]?.rating)
    );
    if (touched.length === 0) return;
    setCells((prev) => {
      const next = { ...prev };
      for (const k of touched) {
        next[k] = { ...(next[k] ?? { rating: null, note: "" }), rating: "meets" };
      }
      return next;
    });
    queue(touched);
  }

  function setRowAll(memberId: string, rating: Rating) {
    const touched = CATEGORIES.map((cat) => key(memberId, cat.key));
    setCells((prev) => {
      const next = { ...prev };
      for (const k of touched) {
        next[k] = { ...(next[k] ?? { rating: null, note: "" }), rating };
      }
      return next;
    });
    queue(touched);
  }

  // ── Week navigation ───────────────────────────────────────────────────────

  const goToWeek = useCallback(
    async (target: number) => {
      if (target < 1 || target > project.weeks || target === week) return;
      await flush(); // never navigate away from unsaved cells
      setLoadingWeek(true);
      try {
        const res = await fetch(
          `/api/accountability?project_id=${project.id}&week=${target}`
        );
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConsultants(data.consultants ?? []);
        setCells(buildCells(data.consultants ?? [], data.ratings ?? []));
        setWeek(data.week);
        setStatus("idle");
        setOpenNote(null);
        const url = new URL(window.location.href);
        url.searchParams.set("project", project.id);
        url.searchParams.set("week", String(data.week));
        window.history.replaceState(null, "", url.toString());
      } catch {
        setError("Could not load that week.");
      } finally {
        setLoadingWeek(false);
      }
    },
    [flush, project.id, project.weeks, week]
  );

  const readOnly = !canRate || demo;

  return (
    <div className="space-y-5">
      {/* ── Week bar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void goToWeek(week - 1)}
            disabled={week <= 1 || loadingWeek}
            className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)] hover:text-[var(--bg-dark)] disabled:opacity-30 disabled:hover:border-[var(--border)] transition-colors"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-[9.5rem]">
            <p className="font-display font-extrabold text-lg text-[var(--bg-dark)] leading-tight">
              Week {week}
              {week === props.currentWeek && (
                <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wider text-[var(--gold-deep)]">
                  This week
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--muted)]">{weekRangeLabel(project.starts_on, week)}</p>
          </div>
          <button
            type="button"
            onClick={() => void goToWeek(week + 1)}
            disabled={week >= project.weeks || loadingWeek}
            className="grid place-items-center w-8 h-8 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)] hover:text-[var(--bg-dark)] disabled:opacity-30 disabled:hover:border-[var(--border)] transition-colors"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <CompletionPill filled={filled} total={total} />
          <SaveIndicator status={status} onRetry={() => void flush()} />
        </div>
      </div>

      {demo && (
        <p className="rounded-xl border border-[var(--gold-soft)] bg-[var(--bg-cream)]/60 px-4 py-3 text-sm text-[var(--bg-dark)]">
          <strong>Demo data.</strong> Supabase isn&rsquo;t configured, so nothing here saves.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* ── Quick fill ───────────────────────────────────────────────────── */}
      {!readOnly && remaining > 0 && consultants.length > 0 && (
        <button
          type="button"
          onClick={fillRemainingWithMeets}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--gold)] bg-[var(--bg-cream)]/50 px-4 py-2 text-sm font-medium text-[var(--bg-dark)] hover:bg-[var(--gold-soft)]/40 transition-colors"
        >
          <Wand2 size={15} />
          Set the remaining {remaining} to Meets
        </button>
      )}

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      {consultants.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-white px-5 py-8 text-center text-sm text-[var(--muted)]">
          No consultants are on this project yet. Add them to <code>project_members</code> with
          seat <code>consultant</code>.
        </p>
      ) : (
        <div
          className={`rounded-2xl border border-[var(--border)] bg-white overflow-hidden transition-opacity ${
            loadingWeek ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {/* Column headers — desktop only; each cell carries its own label on mobile. */}
          <div className="hidden md:grid grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,1fr))] gap-4 border-b border-[var(--border)] bg-[var(--bg-cream)]/40 px-5 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Consultant
            </span>
            {CATEGORIES.map((c) => (
              <span
                key={c.key}
                className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
                title={c.blurb}
              >
                {c.label}
              </span>
            ))}
          </div>

          <ul className="divide-y divide-[var(--border)]">
            {consultants.map((consultant) => (
              <li key={consultant.member_id} className="px-5 py-4">
                <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,1fr))] gap-4 md:items-center">
                  <div className="flex items-center justify-between gap-3 md:block">
                    <div>
                      <p className="font-display font-bold text-[var(--bg-dark)] leading-tight">
                        {consultant.full_name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{consultant.email}</p>
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => setRowAll(consultant.member_id, "meets")}
                        className="shrink-0 text-[11px] font-medium text-[var(--muted)] hover:text-[var(--gold-deep)] underline underline-offset-2"
                      >
                        All meets
                      </button>
                    )}
                  </div>

                  {CATEGORIES.map((category) => {
                    const k = key(consultant.member_id, category.key);
                    const cell = cells[k] ?? { rating: null, note: "" };
                    return (
                      <div key={category.key} className="space-y-1.5">
                        <p className="md:hidden text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                          {category.label}
                        </p>
                        <RatingPicker
                          value={cell.rating}
                          disabled={readOnly}
                          onChange={(r) => setRating(consultant.member_id, category.key, r)}
                          ariaLabel={`${category.label} for ${consultant.full_name}`}
                        />
                        <button
                          type="button"
                          onClick={() => setOpenNote(openNote === k ? null : k)}
                          className={`inline-flex items-center gap-1 text-[11px] transition-colors ${
                            cell.note
                              ? "text-[var(--gold-deep)] font-medium"
                              : "text-[var(--muted)] hover:text-[var(--bg-dark)]"
                          }`}
                        >
                          <MessageSquare size={11} />
                          {cell.note ? "Note added" : "Add note"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Note editor for whichever cell in this row is open. */}
                {CATEGORIES.map((category) => {
                  const k = key(consultant.member_id, category.key);
                  if (openNote !== k) return null;
                  const cell = cells[k] ?? { rating: null, note: "" };
                  return (
                    <div
                      key={`note-${category.key}`}
                      className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/30 p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[var(--bg-dark)]">
                          {category.label} · {consultant.full_name}
                        </p>
                        <button
                          type="button"
                          onClick={() => setOpenNote(null)}
                          className="text-[var(--muted)] hover:text-[var(--bg-dark)]"
                          aria-label="Close note"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <textarea
                        autoFocus
                        rows={2}
                        disabled={readOnly}
                        value={cell.note}
                        onChange={(e) => setNote(consultant.member_id, category.key, e.target.value)}
                        onBlur={() => void flush()}
                        placeholder="Optional — what happened, in one line. Only leadership sees this."
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--bg-dark)] placeholder:text-[var(--muted)]/70 focus:border-[var(--gold)] focus:outline-none resize-y"
                      />
                      {!cell.rating && (
                        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
                          Pick a rating above and the note saves with it.
                        </p>
                      )}
                    </div>
                  );
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!canRate && !demo && (
        <p className="text-sm text-[var(--muted)]">
          You&rsquo;re viewing this project read-only. Only its PM and SC can change ratings.
        </p>
      )}
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

const RATING_STYLES: Record<Rating, { on: string; off: string }> = {
  below: {
    on: "bg-red-600 text-white border-red-600",
    off: "text-[var(--muted)] hover:bg-red-50 hover:text-red-700",
  },
  meets: {
    on: "bg-emerald-100 text-emerald-900 border-emerald-300",
    off: "text-[var(--muted)] hover:bg-emerald-50 hover:text-emerald-800",
  },
  exceeds: {
    on: "bg-emerald-700 text-white border-emerald-700",
    off: "text-[var(--muted)] hover:bg-emerald-50 hover:text-emerald-800",
  },
};

/**
 * Three buttons, not a <select>. A dropdown costs two clicks and a scan; this
 * costs one click and the whole week's state is readable at a glance — which is
 * exactly what the spreadsheet's colour fill was doing informally.
 */
function RatingPicker({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: Rating | null;
  onChange: (r: Rating) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex w-full rounded-lg border border-[var(--border)] overflow-hidden ${
        value === null ? "ring-1 ring-inset ring-[var(--gold-soft)]" : ""
      }`}
    >
      {RATINGS.map((r) => {
        const selected = value === r;
        const style = RATING_STYLES[r];
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(r)}
            className={`flex-1 px-1.5 py-1.5 text-[12px] font-medium border-r border-[var(--border)] last:border-r-0 transition-colors disabled:cursor-default ${
              selected ? style.on : `bg-white ${disabled ? "" : style.off}`
            }`}
          >
            {RATING_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

function CompletionPill({ filled, total }: { filled: number; total: number }) {
  const done = total > 0 && filled >= total;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        done ? "bg-emerald-100 text-emerald-800" : "bg-[var(--bg-cream)] text-[var(--gold-deep)]"
      }`}
    >
      {done && <Check size={13} />}
      {done ? "Week complete" : `${filled} of ${total} rated`}
    </span>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <Loader2 size={13} className="animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
        <Check size={13} />
        Saved
      </span>
    );
  }
  if (status === "error") {
    return (
      <button type="button" onClick={onRetry} className="text-xs font-medium text-red-600 underline">
        Retry save
      </button>
    );
  }
  return null;
}

export { weekCompletion };
