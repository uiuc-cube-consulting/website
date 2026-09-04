// Normalising and formatting Google Calendar events. Pure — no I/O, no
// googleapis import — so it is testable and safe in client components.
//
// Two things here are easy to get wrong and are the reason this is separate from
// the fetching code:
//
//   ALL-DAY vs TIMED. Google returns `start.date` (a bare YYYY-MM-DD) for an
//   all-day event and `start.dateTime` (an instant) for a timed one. They are
//   different kinds of value: a bare date has no timezone, and converting it as
//   if it did shifts the event a day for anyone west of UTC — which is everyone
//   here. So the two are kept apart all the way through.
//
//   ALL-DAY END DATES ARE EXCLUSIVE. A one-day event on the 3rd comes back as
//   start 2026-09-03, end 2026-09-04. Rendered naively that reads as two days.

export const CLUB_TIME_ZONE = "America/Chicago";

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  /** ISO instant for timed events; bare YYYY-MM-DD for all-day. */
  start: string;
  end: string;
  allDay: boolean;
  htmlLink?: string;
};

/** The shape we care about from the Calendar API, without importing googleapis. */
export type RawEvent = {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  htmlLink?: string | null;
  status?: string | null;
  start?: { date?: string | null; dateTime?: string | null } | null;
  end?: { date?: string | null; dateTime?: string | null } | null;
};

/**
 * One API event -> our shape, or null if it is not something to show.
 *
 * Cancelled events are dropped: they still come back from the API when a
 * recurring instance is deleted, and rendering them puts meetings on the board
 * that were explicitly called off.
 */
export function normalizeEvent(raw: RawEvent): CalendarEvent | null {
  if (!raw?.id) return null;
  if (raw.status === "cancelled") return null;

  const startDate = raw.start?.date ?? null;
  const startTime = raw.start?.dateTime ?? null;
  if (!startDate && !startTime) return null;

  const allDay = Boolean(startDate);
  const start = (startDate ?? startTime)!;
  const end = (raw.end?.date ?? raw.end?.dateTime ?? start)!;

  return {
    id: raw.id,
    // An untitled Google event shows as "(No title)" in Google's own UI.
    title: (raw.summary ?? "").trim() || "(No title)",
    description: raw.description?.trim() || undefined,
    location: raw.location?.trim() || undefined,
    start,
    end,
    allDay,
    htmlLink: raw.htmlLink ?? undefined,
  };
}

export function normalizeEvents(raws: RawEvent[]): CalendarEvent[] {
  return raws.map(normalizeEvent).filter((e): e is CalendarEvent => e !== null);
}

/**
 * The calendar day an event belongs to, as YYYY-MM-DD in `timeZone`.
 *
 * For a timed event this is a real conversion — an 8pm Central meeting is the
 * next day in UTC, and grouping on the raw ISO string would file it under
 * tomorrow. For an all-day event the date is already local and must NOT be
 * converted, or it slides a day.
 */
export function dayKey(event: CalendarEvent, timeZone = CLUB_TIME_ZONE): string {
  if (event.allDay) return event.start.slice(0, 10);
  return instantDayKey(event.start, timeZone);
}

/**
 * The club-local calendar day an ISO instant falls on, as YYYY-MM-DD.
 *
 * Split out of `dayKey` because the month grid needs the same conversion for an
 * event's END, and doing it by hand a second time is how the two drift.
 */
export function instantDayKey(iso: string, timeZone = CLUB_TIME_ZONE): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  // en-CA renders as YYYY-MM-DD, which sorts lexicographically.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Today, in the club's timezone. `now` is injectable so tests aren't clock-dependent. */
export function todayKey(timeZone = CLUB_TIME_ZONE, now = new Date()): string {
  return instantDayKey(now.toISOString(), timeZone);
}

/** "Thursday, September 3" for a YYYY-MM-DD key. */
export function formatDayLabel(key: string, timeZone = CLUB_TIME_ZONE): string {
  // Anchored at noon UTC so that shifting into any US timezone cannot cross
  // midnight and rename the day.
  const d = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(d);
}

/** "6:00 – 7:30 PM", "6:00 PM", or "All day". */
export function formatEventTime(event: CalendarEvent, timeZone = CLUB_TIME_ZONE): string {
  if (event.allDay) return "All day";
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime())) return "";

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);

  const s = fmt(start);
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return s;

  const e = fmt(end);
  // "6:00 PM – 7:30 PM" reads better as "6:00 – 7:30 PM" when both share a
  // meridiem, which is the common case for a single meeting.
  const sMer = s.slice(-2);
  const eMer = e.slice(-2);
  if (sMer === eMer) return `${s.slice(0, -3)} – ${e}`;
  return `${s} – ${e}`;
}

export type EventDay = { key: string; label: string; events: CalendarEvent[] };

/**
 * Group into days, chronologically, with all-day events first within a day.
 * `now` is injectable so tests are not clock-dependent.
 */
export function groupByDay(
  events: CalendarEvent[],
  timeZone = CLUB_TIME_ZONE
): EventDay[] {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = dayKey(e, timeZone);
    const cur = byDay.get(key);
    if (cur) cur.push(e);
    else byDay.set(key, [e]);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, evts]) => ({
      key,
      label: formatDayLabel(key, timeZone),
      events: evts.sort((x, y) => {
        if (x.allDay !== y.allDay) return x.allDay ? -1 : 1;
        return x.start.localeCompare(y.start);
      }),
    }));
}

/**
 * The inclusive last day an all-day event covers. Google's end date is
 * exclusive, so a single-day event would otherwise render as spanning two.
 */
export function inclusiveEndDate(event: CalendarEvent): string {
  if (!event.allDay) return event.end;
  const d = new Date(`${event.end}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return event.end;
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** True when an all-day event covers more than one day. */
export function isMultiDay(event: CalendarEvent): boolean {
  return event.allDay && inclusiveEndDate(event) > event.start;
}

// ── Display shaping ──────────────────────────────────────────────────────────

export type DisplayEvent = CalendarEvent & {
  /** Pre-rendered "6:00 – 7:30 PM" / "All day". */
  time: string;
  /** Set for a genuine multi-day all-day event, e.g. "through Monday, Sep 7". */
  through?: string;
  /**
   * EVERY club-local day this event covers, not just the one it is filed under.
   *
   * The list groups an event once, under the day it starts, and says "through
   * Monday" — but a grid has a cell for each of those days and a retreat that
   * appears only on the Friday looks like it ends there. Computed on the server
   * so the browser never has to convert an instant into a club-local date.
   */
  dayKeys: string[];
};

export type DisplayDay = { key: string; label: string; events: DisplayEvent[] };

/**
 * Group and pre-format for rendering.
 *
 * Times are formatted on the SERVER so every member sees the club's timezone.
 * Formatting in the browser would render in each viewer's local zone, so a
 * member home for break in another timezone would see meeting times that quietly
 * disagree with everyone else's.
 */
export function toDisplayDays(events: CalendarEvent[], timeZone = CLUB_TIME_ZONE): DisplayDay[] {
  return groupByDay(events, timeZone).map((day) => ({
    ...day,
    events: day.events.map((e) => ({
      ...e,
      time: formatEventTime(e, timeZone),
      through: isMultiDay(e) ? `through ${formatDayLabel(inclusiveEndDate(e), timeZone)}` : undefined,
      dayKeys: eventDayKeys(e, timeZone),
    })),
  }));
}

// ── Month grid ───────────────────────────────────────────────────────────────
//
// Everything below works on YYYY-MM-DD strings rather than Date objects, and
// that is deliberate. A key produced by `dayKey` is already a club-local
// calendar date; re-parsing it into a Date in the browser reintroduces exactly
// the timezone slip the top of this file exists to prevent. Date is used only as
// an arithmetic engine, always anchored at noon UTC so no shift can cross
// midnight and change the answer.

/** Shift a YYYY-MM-DD key by whole days. */
export function addDaysKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-09-17" -> "2026-09". */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** Shift a YYYY-MM month key by whole months. */
export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  // Month is 0-based here, so `m - 1 + n` lets Date normalise December→January
  // and the year rollover in both directions without a special case.
  const d = new Date(Date.UTC(y, m - 1 + n, 1, 12));
  return d.toISOString().slice(0, 7);
}

/** "September 2026". */
export function monthLabel(monthKey: string, timeZone = CLUB_TIME_ZONE): string {
  const d = new Date(`${monthKey}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return monthKey;
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "long", year: "numeric" }).format(d);
}

/**
 * Every club-local day an event covers, inclusive of both ends.
 *
 * All-day and timed events reach their end date differently — one through
 * Google's EXCLUSIVE end date, the other through a real timezone conversion —
 * which is the whole reason this is one function rather than two call sites.
 */
export function eventDayKeys(event: CalendarEvent, timeZone = CLUB_TIME_ZONE): string[] {
  const first = dayKey(event, timeZone);
  const last = event.allDay ? inclusiveEndDate(event) : instantDayKey(event.end, timeZone);

  // A malformed or backwards range must still put the event somewhere, and the
  // day it starts is the honest answer.
  if (!last || last <= first) return [first];

  const keys: string[] = [];
  let cursor = first;
  // A year is far past anything a club calendar holds; the bound is here so a
  // bad end date cannot spin this loop forever.
  for (let i = 0; i <= 366 && cursor <= last; i++) {
    keys.push(cursor);
    cursor = addDaysKey(cursor, 1);
  }
  return keys;
}

export type MonthCell = {
  /** YYYY-MM-DD. */
  key: string;
  /** Day of the month, 1–31. */
  day: number;
  /** False for the leading/trailing cells borrowed from the adjacent months. */
  inMonth: boolean;
  isToday: boolean;
  events: DisplayEvent[];
};

export type MonthGrid = {
  monthKey: string;
  label: string;
  /** Always whole weeks, Sunday-first: 4–6 rows of exactly 7. */
  weeks: MonthCell[][];
};

/**
 * Lay a month out as weeks, with each day's events attached.
 *
 * Pure and client-safe: `days` arrives from the server already grouped and
 * formatted, and every event carries the `dayKeys` it spans, so this is bucket
 * lookup and calendar arithmetic — no formatting, no timezone maths.
 *
 * The grid deliberately includes the neighbouring months' edge days rather than
 * padding with blanks. A week that runs Aug 30 – Sep 5 is a real week, and
 * showing the 30th and 31st greyed keeps an event on either side of a month
 * boundary visible instead of vanishing.
 */
export function buildMonthGrid(
  monthKey: string,
  days: DisplayDay[],
  today: string
): MonthGrid {
  const byDay = new Map<string, DisplayEvent[]>();
  for (const day of days) {
    for (const event of day.events) {
      // Indexed by every day it spans, not by the day it is filed under.
      for (const key of event.dayKeys.length ? event.dayKeys : [day.key]) {
        const cur = byDay.get(key);
        if (cur) {
          // A multi-day event reached from two different start-day groups would
          // otherwise be listed twice in the same cell.
          if (!cur.some((e) => e.id === event.id)) cur.push(event);
        } else {
          byDay.set(key, [event]);
        }
      }
    }
  }

  const first = `${monthKey}-01`;
  const firstWeekday = new Date(`${first}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells: MonthCell[] = [];
  const total = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const key = addDaysKey(first, i - firstWeekday);
    const events = (byDay.get(key) ?? []).slice().sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
    cells.push({
      key,
      day: Number(key.slice(8, 10)),
      inMonth: key.startsWith(monthKey),
      isToday: key === today,
      events,
    });
  }

  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { monthKey, label: monthLabel(monthKey), weeks };
}
