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
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return event.start.slice(0, 10);
  // en-CA renders as YYYY-MM-DD, which sorts lexicographically.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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
    })),
  }));
}
