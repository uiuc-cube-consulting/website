"use client";

/**
 * Club events for the member dashboard.
 *
 * This replaced a Google Calendar iframe. The iframe rendered with the VIEWER's
 * Google session inside a third-party frame, which fails two ways for a calendar
 * that is not public — the embed loads Google account index 0, so anyone whose
 * university account is not their first account sees nothing; and third-party
 * cookie blocking (Safari by default, Chrome increasingly) stops the frame
 * seeing their session at all. Both render an EMPTY calendar with no error,
 * while the same person sees a full month on calendar.google.com.
 *
 * /api/calendar reads the calendar with the service account instead, so the
 * viewer's browser is not involved, the calendar stays private, and the portal's
 * own sign-in is the gate.
 *
 * Two views over the same data. MONTH is the default and is what most people
 * mean by "the calendar" — you can see the shape of a week, and that the 14th is
 * free. LIST answers a different question ("what is next?") and stays because it
 * is the better read on a phone, where a seven-column grid is unusable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, List as ListIcon, MapPin } from "lucide-react";
import {
  addMonths,
  buildMonthGrid,
  monthKeyOf,
  type DisplayDay,
  type DisplayEvent,
  type MonthCell,
} from "@/lib/calendar-format";

type ApiResponse = {
  ok?: boolean;
  days: DisplayDay[];
  count?: number;
  error?: string;
  hint?: string;
  /** Club-local today, YYYY-MM-DD. The server decides this, not the browser. */
  today?: string;
  /** The month this payload covers, YYYY-MM; null for the upcoming window. */
  month?: string | null;
};

type View = "month" | "list";

// How many events a cell shows before collapsing into "+2 more". Three keeps
// every row the same height on a normal club month without hiding anything on
// a typical day.
const CELL_LIMIT = 3;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarEmbed() {
  const [view, setView] = useState<View>("month");

  // Two windows over the same calendar, held separately so flipping the toggle
  // back and forth does not refetch either of them.
  const [monthData, setMonthData] = useState<ApiResponse | null>(null);
  const [listData, setListData] = useState<ApiResponse | null>(null);

  // Null until the first response tells us the club's current month. The server
  // is the authority: a member abroad at a month boundary would otherwise open
  // on the wrong month, and the empty grid would look like a broken calendar.
  const [month, setMonth] = useState<string | null>(null);

  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  // The month we already hold. Compared against `month` so that adopting the
  // month named by the first response does not immediately refetch it — the
  // response we adopted it from IS that month's data.
  const loadedMonth = useRef<string | null>(null);
  // Discards a slow response for a month the member has already navigated past.
  const requestId = useRef(0);

  useEffect(() => {
    if (loadedMonth.current !== null && loadedMonth.current === month) return;

    const ctrl = new AbortController();
    const id = ++requestId.current;

    (async () => {
      try {
        // No `month` on the first pass: the server answers with the current
        // club month, which is exactly what the grid wants to open on.
        const url = month ? `/api/calendar?month=${month}` : "/api/calendar";
        const r = await fetch(url, { signal: ctrl.signal });
        const json: ApiResponse = await r.json();
        if (ctrl.signal.aborted || id !== requestId.current) return;

        const resolved = json.month ?? (json.today ? monthKeyOf(json.today) : null);
        loadedMonth.current = resolved;
        setMonthData(json);
        setFailed(false);
        if (resolved && resolved !== month) setMonth(resolved);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setFailed(true);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    })();

    return () => ctrl.abort();
  }, [month]);

  /** Move to another month. Loading is flagged here, in the handler, not in the effect. */
  const goToMonth = useCallback((target: string) => {
    setSelected(null);
    setLoading(true);
    setMonth(target);
  }, []);

  /** The list's window is "from now", which the month endpoint never returns. */
  const showList = useCallback(async () => {
    setView("list");
    if (listData) return;
    setLoading(true);
    try {
      const r = await fetch("/api/calendar?window=upcoming");
      setListData(await r.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [listData]);

  const data = view === "month" ? monthData : (listData ?? monthData);
  const today = monthData?.today ?? "";

  const grid = useMemo(
    () => (month ? buildMonthGrid(month, monthData?.days ?? [], today) : null),
    [month, monthData?.days, today]
  );

  const selectedCell = useMemo(() => {
    if (!selected || !grid) return null;
    return grid.weeks.flat().find((cell) => cell.key === selected) ?? null;
  }, [selected, grid]);

  if (failed) {
    return (
      <Shell>
        <p className="text-sm text-[var(--muted)]">Could not load the calendar. Refresh to try again.</p>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <p className="text-sm text-[var(--muted)]">Loading events…</p>
      </Shell>
    );
  }

  // A missing share or a disabled API is a setup state, not a crash — say what to
  // do about it rather than showing an empty month, which is exactly the silent
  // failure this component was built to end.
  if (data.error) {
    return (
      <Shell>
        <p className="font-display font-bold text-[var(--bg-dark)]">Calendar unavailable</p>
        <p className="mt-2 text-sm text-[var(--muted)]">{data.error}</p>
        {data.hint && <p className="mt-1 text-xs text-[var(--muted)]">{data.hint}</p>}
      </Shell>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {view === "month" && grid ? (
            <>
              <NavButton label="Previous month" onClick={() => goToMonth(addMonths(grid.monthKey, -1))}>
                <ChevronLeft className="w-4 h-4" aria-hidden />
              </NavButton>
              <NavButton label="Next month" onClick={() => goToMonth(addMonths(grid.monthKey, 1))}>
                <ChevronRight className="w-4 h-4" aria-hidden />
              </NavButton>
              <h3
                className="ml-2 font-display font-bold text-[var(--bg-dark)] text-[15px] md:text-base"
                aria-live="polite"
              >
                {grid.label}
              </h3>
              {today && monthKeyOf(today) !== grid.monthKey && (
                <button
                  type="button"
                  onClick={() => goToMonth(monthKeyOf(today))}
                  className="ml-2 text-[11px] font-semibold text-[var(--gold-deep)] hover:underline"
                >
                  Today
                </button>
              )}
            </>
          ) : (
            <h3 className="font-display font-bold text-[var(--bg-dark)] text-[15px] md:text-base">
              Upcoming
            </h3>
          )}
        </div>

        <div
          className="flex items-center gap-1 rounded-full border border-[var(--border)] p-1"
          role="tablist"
          aria-label="Calendar view"
        >
          <ViewTab active={view === "month"} onClick={() => setView("month")} label="Month view">
            <CalendarDays className="w-3.5 h-3.5" aria-hidden />
            Month
          </ViewTab>
          <ViewTab active={view === "list"} onClick={showList} label="List view">
            <ListIcon className="w-3.5 h-3.5" aria-hidden />
            List
          </ViewTab>
        </div>
      </header>

      <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
        {view === "month" && grid ? (
          <>
            <div className="mt-4 grid grid-cols-7 gap-px">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="pb-2 text-center text-[10px] md:text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]"
                >
                  {/* The three-letter name is unreadable at phone widths; the
                      initial is enough once the column position is established. */}
                  <span className="md:hidden">{d.slice(0, 1)}</span>
                  <span className="hidden md:inline">{d}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--border)]">
              {grid.weeks.flat().map((cell) => (
                <Cell
                  key={cell.key}
                  cell={cell}
                  selected={cell.key === selected}
                  onSelect={() => setSelected(cell.key === selected ? null : cell.key)}
                />
              ))}
            </div>

            {selectedCell ? (
              <DayDetail cell={selectedCell} />
            ) : (
              grid.weeks.flat().some((c) => c.events.length) && (
                <p className="mt-3 text-center text-[11px] text-[var(--muted)]">
                  Select a day to see what&apos;s on it.
                </p>
              )
            )}

            {!loading && !grid.weeks.flat().some((c) => c.inMonth && c.events.length) && (
              <p className="mt-4 text-center text-sm text-[var(--muted)]">
                Nothing on the calendar this month.
              </p>
            )}
          </>
        ) : (
          <ListView days={data.days ?? []} />
        )}
      </div>
    </div>
  );
}

function Cell({
  cell,
  selected,
  onSelect,
}: {
  cell: MonthCell;
  selected: boolean;
  onSelect: () => void;
}) {
  const hidden = cell.events.length - CELL_LIMIT;

  return (
    <button
      type="button"
      onClick={onSelect}
      // A day with nothing on it is not a control — it stays in the grid for
      // shape, but there is nothing to open.
      disabled={!cell.events.length}
      aria-pressed={selected}
      aria-label={`${cell.key}, ${cell.events.length} event${cell.events.length === 1 ? "" : "s"}`}
      className={`min-h-[4.5rem] md:min-h-[6.5rem] p-1.5 md:p-2 text-left align-top transition-colors ${
        cell.inMonth ? "bg-white" : "bg-[var(--bg-cream)]/30"
      } ${selected ? "ring-2 ring-inset ring-[var(--gold)]" : ""} ${
        cell.events.length ? "cursor-pointer hover:bg-[var(--bg-cream)]/60" : "cursor-default"
      }`}
    >
      <span
        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] md:text-xs font-semibold ${
          cell.isToday
            ? "bg-[var(--bg-dark)] text-[var(--fg-on-dark)]"
            : cell.inMonth
              ? "text-[var(--bg-dark)]"
              : "text-[var(--muted)]/60"
        }`}
      >
        {cell.day}
      </span>

      <span className="mt-1 flex flex-col gap-0.5">
        {cell.events.slice(0, CELL_LIMIT).map((e) => (
          <span
            key={e.id}
            title={`${e.title} · ${e.time}`}
            className={`truncate rounded px-1 py-0.5 text-[10px] md:text-[11px] leading-tight ${
              e.allDay
                ? "bg-[var(--gold)]/25 text-[var(--bg-dark)] font-medium"
                : "text-[var(--bg-dark)]"
            } ${cell.inMonth ? "" : "opacity-55"}`}
          >
            {/* The time carries most of the information on a dense day, but
                there is no room for it beside a title at phone widths. */}
            {!e.allDay && compactTime(e.time) && (
              <span className="hidden md:inline font-semibold text-[var(--gold-deep)]">
                {compactTime(e.time)}{" "}
              </span>
            )}
            {e.title}
          </span>
        ))}
        {hidden > 0 && (
          <span className="px-1 text-[10px] font-semibold text-[var(--muted)]">+{hidden} more</span>
        )}
      </span>
    </button>
  );
}

/** The clicked day, opened underneath the grid. */
function DayDetail({ cell }: { cell: MonthCell }) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 p-4">
      <p className="eyebrow">{formatCellLabel(cell.key)}</p>
      <ul className="mt-2 space-y-2">
        {cell.events.map((e) => (
          <EventRow key={e.id} event={e} />
        ))}
      </ul>
    </div>
  );
}

function ListView({ days }: { days: DisplayDay[] }) {
  if (!days.length) {
    return (
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        No events scheduled in the next few months.
      </p>
    );
  }
  return (
    <div className="mt-4 space-y-6">
      {days.map((day) => (
        <div key={day.key}>
          <p className="eyebrow">{day.label}</p>
          <ul className="mt-2 space-y-2">
            {day.events.map((e) => (
              <EventRow key={e.id} event={e} boxed />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EventRow({ event, boxed }: { event: DisplayEvent; boxed?: boolean }) {
  return (
    <li
      className={
        boxed
          ? "rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 px-4 py-3"
          : "rounded-lg bg-white border border-[var(--border)] px-3 py-2"
      }
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="font-semibold text-[var(--bg-dark)] text-sm">{event.title}</p>
        <span className="text-xs font-medium text-[var(--gold-deep)]">{event.time}</span>
      </div>
      {event.through && <p className="mt-0.5 text-xs text-[var(--muted)]">{event.through}</p>}
      {event.location && (
        <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted)]">
          <MapPin className="w-3 h-3 shrink-0" aria-hidden />
          {event.location}
        </p>
      )}
      {event.description && (
        <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">{event.description}</p>
      )}
    </li>
  );
}

/**
 * "1pm" — the widest a grid chip can afford before it eats the title.
 *
 * Built from the server's already-formatted club-local string rather than from
 * the raw instant, so no timezone work happens here. `formatEventTime` drops a
 * shared meridiem from the start of a range ("1:00 – 3:00 PM"), which is what
 * the borrow below puts back: a bare "1:00" on a calendar is genuinely
 * ambiguous, and 1am is a plausible enough club event to be worth the two
 * characters.
 */
function compactTime(time: string): string {
  if (!time || time === "All day") return "";
  const [startRaw, endRaw = ""] = time.split(" – ");
  const meridiem = /[AP]M$/i.exec(startRaw)?.[0] ?? /[AP]M$/i.exec(endRaw)?.[0] ?? "";
  const clock = startRaw.replace(/\s*[AP]M$/i, "").trim();
  // "6:00" reads as "6"; "6:30" keeps its minutes.
  const short = clock.endsWith(":00") ? clock.slice(0, -3) : clock;
  return `${short}${meridiem.toLowerCase()}`;
}

/**
 * "Thursday, September 3" for a cell key.
 *
 * Formatted here rather than on the server because a cell can be a day with no
 * events, which the server never sent a label for. Safe to do in the browser:
 * the key is a plain calendar date, anchored at noon UTC so no timezone shift
 * can cross midnight and rename the day.
 */
function formatCellLabel(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(d);
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="p-1.5 rounded-lg text-[var(--muted)] hover:bg-[var(--bg-cream)] hover:text-[var(--bg-dark)] transition-colors"
    >
      {children}
    </button>
  );
}

function ViewTab({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
        active
          ? "bg-[var(--bg-dark)] text-[var(--fg-on-dark)]"
          : "text-[var(--muted)] hover:text-[var(--bg-dark)]"
      }`}
    >
      {children}
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 md:p-10 text-center">
      {children}
    </div>
  );
}
