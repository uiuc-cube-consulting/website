/**
 * The month grid.
 *
 * The list view could get away with filing an event under the day it starts and
 * saying "through Monday". A grid cannot: it has a cell for every one of those
 * days, so a retreat that appears only on the Friday reads as ending there.
 * That expansion, and the date arithmetic around month edges, is what breaks
 * quietly — so it is what is pinned here.
 */

import {
  addDaysKey,
  addMonths,
  buildMonthGrid,
  eventDayKeys,
  monthKeyOf,
  monthLabel,
  todayKey,
  toDisplayDays,
  normalizeEvents,
  CLUB_TIME_ZONE,
  type RawEvent,
} from "@/lib/calendar-format";

const timed = (id: string, startISO: string, endISO: string, summary = "Meeting"): RawEvent => ({
  id, summary, start: { dateTime: startISO }, end: { dateTime: endISO },
});
const allDay = (id: string, start: string, end: string, summary = "Retreat"): RawEvent => ({
  id, summary, start: { date: start }, end: { date: end },
});

/** Events → the DisplayDay[] the API sends, which is what the grid consumes. */
function display(raws: RawEvent[]) {
  return toDisplayDays(normalizeEvents(raws), CLUB_TIME_ZONE);
}

describe("date arithmetic on day keys", () => {
  it("crosses month and year boundaries", () => {
    expect(addDaysKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap day", () => {
    expect(addDaysKey("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysKey("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("rolls months over the year in both directions", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-09", 4)).toBe("2027-01");
  });

  it("labels and slices months", () => {
    expect(monthLabel("2026-09")).toBe("September 2026");
    expect(monthKeyOf("2026-09-17")).toBe("2026-09");
  });

  it("reads today in the club's timezone, not the runner's", () => {
    // 01:30 UTC on the 4th is still the evening of the 3rd in Chicago. A grid
    // built from the UTC date would ring the wrong cell all evening, every day.
    const justAfterMidnightUTC = new Date("2026-09-04T01:30:00Z");
    expect(todayKey(CLUB_TIME_ZONE, justAfterMidnightUTC)).toBe("2026-09-03");
  });
});

describe("eventDayKeys", () => {
  it("gives a single-day all-day event exactly one day", () => {
    // Google's end date is EXCLUSIVE: this is one day, not two.
    const [e] = normalizeEvents([allDay("a", "2026-09-03", "2026-09-04")]);
    expect(eventDayKeys(e)).toEqual(["2026-09-03"]);
  });

  it("expands a multi-day all-day event across every day it covers", () => {
    const [e] = normalizeEvents([allDay("a", "2026-09-04", "2026-09-07")]);
    expect(eventDayKeys(e)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("keeps a normal timed meeting on one day", () => {
    const [e] = normalizeEvents([timed("a", "2026-09-03T23:00:00Z", "2026-09-04T00:30:00Z")]);
    // 6:00–7:30pm Chicago on the 3rd, even though it ends on the 4th in UTC.
    expect(eventDayKeys(e)).toEqual(["2026-09-03"]);
  });

  it("spans a timed event that genuinely crosses club midnight", () => {
    const [e] = normalizeEvents([timed("a", "2026-09-03T22:00:00Z", "2026-09-04T06:00:00Z")]);
    expect(eventDayKeys(e)).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("falls back to the start day for a backwards range", () => {
    const [e] = normalizeEvents([allDay("a", "2026-09-10", "2026-09-01")]);
    expect(eventDayKeys(e)).toEqual(["2026-09-10"]);
  });
});

describe("buildMonthGrid", () => {
  it("lays out whole weeks, Sunday-first, covering the month", () => {
    // September 2026 starts on a Tuesday and has 30 days.
    const grid = buildMonthGrid("2026-09", [], "2026-09-03");
    expect(grid.label).toBe("September 2026");
    expect(grid.weeks.every((w) => w.length === 7)).toBe(true);

    const cells = grid.weeks.flat();
    expect(cells[0].key).toBe("2026-08-30"); // the Sunday before the 1st
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30);
  });

  it("marks the edge days as outside the month rather than blanking them", () => {
    const grid = buildMonthGrid("2026-09", [], "2026-09-03");
    const cells = grid.weeks.flat();
    expect(cells[0]).toMatchObject({ key: "2026-08-30", day: 30, inMonth: false });
    // A week that runs Aug 30 – Sep 5 is a real week; an event on the 31st has
    // to be visible in it.
    expect(cells[1]).toMatchObject({ key: "2026-08-31", inMonth: false });
  });

  it("rings exactly one cell as today, and only when it is in view", () => {
    const inView = buildMonthGrid("2026-09", [], "2026-09-03").weeks.flat();
    expect(inView.filter((c) => c.isToday).map((c) => c.key)).toEqual(["2026-09-03"]);

    const elsewhere = buildMonthGrid("2026-11", [], "2026-09-03").weeks.flat();
    expect(elsewhere.some((c) => c.isToday)).toBe(false);
  });

  it("puts a multi-day event in every cell it covers", () => {
    const days = display([allDay("retreat", "2026-09-04", "2026-09-07", "Fall retreat")]);
    const grid = buildMonthGrid("2026-09", days, "2026-09-01");
    const covered = grid.weeks
      .flat()
      .filter((c) => c.events.some((e) => e.id === "retreat"))
      .map((c) => c.key);

    expect(covered).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("never lists the same event twice in one cell", () => {
    const days = display([allDay("retreat", "2026-09-04", "2026-09-07")]);
    const grid = buildMonthGrid("2026-09", days, "2026-09-01");
    for (const cell of grid.weeks.flat()) {
      expect(new Set(cell.events.map((e) => e.id)).size).toBe(cell.events.length);
    }
  });

  it("orders a day's events with all-day first, then by start time", () => {
    const days = display([
      timed("evening", "2026-09-03T23:00:00Z", "2026-09-04T00:00:00Z", "GBM"),
      timed("morning", "2026-09-03T14:00:00Z", "2026-09-03T15:00:00Z", "Standup"),
      allDay("career", "2026-09-03", "2026-09-04", "Career fair"),
    ]);
    const cell = buildMonthGrid("2026-09", days, "2026-09-01")
      .weeks.flat()
      .find((c) => c.key === "2026-09-03")!;

    expect(cell.events.map((e) => e.id)).toEqual(["career", "morning", "evening"]);
  });

  it("shows an event from the previous month in the leading edge cells", () => {
    // The grid's first row belongs to August; something on Aug 31 must appear
    // there rather than vanishing until you page back.
    const days = display([timed("a", "2026-08-31T18:00:00Z", "2026-08-31T19:00:00Z", "Kickoff")]);
    const grid = buildMonthGrid("2026-09", days, "2026-09-01");
    const cell = grid.weeks.flat().find((c) => c.key === "2026-08-31")!;

    expect(cell.inMonth).toBe(false);
    expect(cell.events.map((e) => e.title)).toEqual(["Kickoff"]);
  });

  it("builds an empty month without inventing cells", () => {
    const grid = buildMonthGrid("2026-09", [], "2026-09-03");
    expect(grid.weeks.flat().every((c) => c.events.length === 0)).toBe(true);
  });

  it("handles a month that starts on a Sunday without a blank leading week", () => {
    // February 2026 starts on a Sunday — the classic off-by-one that produces a
    // whole empty first row.
    const grid = buildMonthGrid("2026-02", [], "2026-02-01");
    expect(grid.weeks[0][0].key).toBe("2026-02-01");
    expect(grid.weeks[0][0].inMonth).toBe(true);
  });
});

/**
 * The grid chip's time label. Pinned because it is derived by string surgery on
 * `formatEventTime`'s output — the two are coupled, and a change to the range
 * separator or the shared-meridiem rule silently breaks this.
 */
describe("compactTime (grid chips)", () => {
  // Kept in step with the copy in CalendarEmbed.tsx.
  function compactTime(time: string): string {
    if (!time || time === "All day") return "";
    const [startRaw, endRaw = ""] = time.split(" – ");
    const meridiem = /[AP]M$/i.exec(startRaw)?.[0] ?? /[AP]M$/i.exec(endRaw)?.[0] ?? "";
    const clock = startRaw.replace(/\s*[AP]M$/i, "").trim();
    const short = clock.endsWith(":00") ? clock.slice(0, -3) : clock;
    return `${short}${meridiem.toLowerCase()}`;
  }

  it("borrows the meridiem a shared-meridiem range drops from its start", () => {
    // "1:00" alone is ambiguous on a calendar; 1am is a plausible event.
    expect(compactTime("1:00 – 3:00 PM")).toBe("1pm");
  });

  it("keeps the start's own meridiem when the range crosses noon", () => {
    expect(compactTime("11:00 AM – 1:00 PM")).toBe("11am");
  });

  it("keeps minutes when they are not zero", () => {
    expect(compactTime("6:30 – 8:00 PM")).toBe("6:30pm");
  });

  it("handles a single time with no range", () => {
    expect(compactTime("6:00 PM")).toBe("6pm");
  });

  it("renders nothing for an all-day event — the chip's fill already says so", () => {
    expect(compactTime("All day")).toBe("");
    expect(compactTime("")).toBe("");
  });

  it("agrees with what formatEventTime actually produces", () => {
    const [evening] = normalizeEvents([timed("a", "2026-09-03T23:00:00Z", "2026-09-04T01:00:00Z")]);
    const days = toDisplayDays([evening], CLUB_TIME_ZONE);
    expect(compactTime(days[0].events[0].time)).toBe("6pm");
  });
});
