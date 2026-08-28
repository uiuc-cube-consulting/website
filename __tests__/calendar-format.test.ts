/**
 * Calendar normalising + formatting.
 *
 * Most of these guard the two classic calendar bugs: treating an all-day date as
 * an instant (which shifts the event a day for anyone west of UTC — i.e. all of
 * us), and rendering Google's exclusive all-day end date literally (which makes
 * every one-day event look like two).
 */

import {
  normalizeEvent,
  normalizeEvents,
  dayKey,
  formatDayLabel,
  formatEventTime,
  groupByDay,
  inclusiveEndDate,
  isMultiDay,
  CLUB_TIME_ZONE,
  type RawEvent,
} from "@/lib/calendar-format";

const timed = (id: string, startISO: string, endISO: string, summary = "Meeting"): RawEvent => ({
  id, summary, start: { dateTime: startISO }, end: { dateTime: endISO },
});
const allDay = (id: string, start: string, end: string, summary = "Retreat"): RawEvent => ({
  id, summary, start: { date: start }, end: { date: end },
});

describe("normalizeEvent", () => {
  it("normalizes a timed event", () => {
    const e = normalizeEvent(timed("1", "2026-09-03T23:00:00Z", "2026-09-04T00:30:00Z", "GBM"))!;
    expect(e).toMatchObject({ id: "1", title: "GBM", allDay: false });
  });

  it("normalizes an all-day event", () => {
    const e = normalizeEvent(allDay("2", "2026-09-03", "2026-09-04"))!;
    expect(e.allDay).toBe(true);
    expect(e.start).toBe("2026-09-03");
  });

  it("drops cancelled events", () => {
    // A deleted instance of a recurring meeting still comes back from the API.
    expect(normalizeEvent({ ...timed("3", "2026-09-03T23:00:00Z", "2026-09-04T00:00:00Z"), status: "cancelled" })).toBeNull();
  });

  it("drops events with no start or no id", () => {
    expect(normalizeEvent({ id: "4" })).toBeNull();
    expect(normalizeEvent({ summary: "x", start: { dateTime: "2026-09-03T23:00:00Z" } })).toBeNull();
  });

  it("falls back to a placeholder title, as Google's own UI does", () => {
    expect(normalizeEvent({ ...timed("5", "2026-09-03T23:00:00Z", "2026-09-04T00:00:00Z"), summary: "  " })!.title)
      .toBe("(No title)");
  });

  it("filters out everything unusable in one pass", () => {
    const out = normalizeEvents([
      timed("1", "2026-09-03T23:00:00Z", "2026-09-04T00:00:00Z"),
      { id: "2" },
      { ...timed("3", "2026-09-03T23:00:00Z", "2026-09-04T00:00:00Z"), status: "cancelled" },
    ]);
    expect(out.map((e) => e.id)).toEqual(["1"]);
  });
});

describe("dayKey", () => {
  /** The bug this exists to prevent. */
  it("files a late-evening Central event under the Central day, not the UTC one", () => {
    // 8pm Central on Sep 3 is 01:00 UTC on Sep 4.
    const e = normalizeEvent(timed("1", "2026-09-04T01:00:00Z", "2026-09-04T02:30:00Z"))!;
    expect(e.start.slice(0, 10)).toBe("2026-09-04"); // what a naive read would give
    expect(dayKey(e, CLUB_TIME_ZONE)).toBe("2026-09-03"); // what a member expects
  });

  it("never shifts an all-day date", () => {
    const e = normalizeEvent(allDay("2", "2026-09-03", "2026-09-04"))!;
    expect(dayKey(e, CLUB_TIME_ZONE)).toBe("2026-09-03");
  });

  it("handles a malformed date without throwing", () => {
    expect(dayKey({ id: "x", title: "t", start: "nonsense", end: "nonsense", allDay: false })).toBe("nonsense");
  });
});

describe("formatDayLabel", () => {
  it("renders a readable day", () => {
    expect(formatDayLabel("2026-09-03")).toBe("Thursday, September 3");
  });

  /** Anchoring at noon UTC is what stops this sliding to the previous day. */
  it("does not shift the day when rendered in Central time", () => {
    expect(formatDayLabel("2026-01-01", CLUB_TIME_ZONE)).toBe("Thursday, January 1");
    expect(formatDayLabel("2026-07-04", CLUB_TIME_ZONE)).toBe("Saturday, July 4");
  });
});

describe("formatEventTime", () => {
  it("collapses a shared meridiem", () => {
    // 6:00pm - 7:30pm Central
    const e = normalizeEvent(timed("1", "2026-09-03T23:00:00Z", "2026-09-04T00:30:00Z"))!;
    expect(formatEventTime(e, CLUB_TIME_ZONE)).toBe("6:00 – 7:30 PM");
  });

  it("keeps both meridiems when they differ", () => {
    // 11:00am - 1:00pm Central
    const e = normalizeEvent(timed("2", "2026-09-03T16:00:00Z", "2026-09-03T18:00:00Z"))!;
    expect(formatEventTime(e, CLUB_TIME_ZONE)).toBe("11:00 AM – 1:00 PM");
  });

  it("says All day for an all-day event", () => {
    expect(formatEventTime(normalizeEvent(allDay("3", "2026-09-03", "2026-09-04"))!)).toBe("All day");
  });

  it("shows just the start when the end is missing or not after it", () => {
    const e = normalizeEvent(timed("4", "2026-09-03T23:00:00Z", "2026-09-03T23:00:00Z"))!;
    expect(formatEventTime(e, CLUB_TIME_ZONE)).toBe("6:00 PM");
  });
});

describe("all-day end dates are exclusive", () => {
  it("reports the inclusive last day", () => {
    const one = normalizeEvent(allDay("1", "2026-09-03", "2026-09-04"))!;
    expect(inclusiveEndDate(one)).toBe("2026-09-03");
  });

  it("does not call a single-day event multi-day", () => {
    expect(isMultiDay(normalizeEvent(allDay("1", "2026-09-03", "2026-09-04"))!)).toBe(false);
  });

  it("does recognise a genuine multi-day event", () => {
    const retreat = normalizeEvent(allDay("2", "2026-09-05", "2026-09-08"))!;
    expect(inclusiveEndDate(retreat)).toBe("2026-09-07");
    expect(isMultiDay(retreat)).toBe(true);
  });

  it("leaves timed events alone", () => {
    const e = normalizeEvent(timed("3", "2026-09-03T23:00:00Z", "2026-09-04T00:30:00Z"))!;
    expect(isMultiDay(e)).toBe(false);
    expect(inclusiveEndDate(e)).toBe(e.end);
  });
});

describe("groupByDay", () => {
  const events = normalizeEvents([
    timed("late", "2026-09-04T01:00:00Z", "2026-09-04T02:00:00Z", "Evening GBM"), // Sep 3 Central
    timed("early", "2026-09-03T16:00:00Z", "2026-09-03T17:00:00Z", "Morning sync"),
    allDay("retreat", "2026-09-05", "2026-09-06"),
  ]);

  it("groups into chronological days", () => {
    const days = groupByDay(events, CLUB_TIME_ZONE);
    expect(days.map((d) => d.key)).toEqual(["2026-09-03", "2026-09-05"]);
    expect(days[0].label).toBe("Thursday, September 3");
  });

  it("puts both Sep 3 events together despite the UTC date differing", () => {
    const days = groupByDay(events, CLUB_TIME_ZONE);
    expect(days[0].events.map((e) => e.id)).toEqual(["early", "late"]);
  });

  it("sorts all-day events before timed ones within a day", () => {
    const mixed = normalizeEvents([
      timed("t", "2026-09-05T16:00:00Z", "2026-09-05T17:00:00Z"),
      allDay("a", "2026-09-05", "2026-09-06"),
    ]);
    expect(groupByDay(mixed, CLUB_TIME_ZONE)[0].events.map((e) => e.id)).toEqual(["a", "t"]);
  });

  it("returns nothing for no events", () => {
    expect(groupByDay([], CLUB_TIME_ZONE)).toEqual([]);
  });
});
