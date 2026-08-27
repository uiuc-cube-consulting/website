/**
 * Semester week math. Every "Week N" in the tracker is derived from the
 * project's starts_on rather than opened by hand, so an off-by-one here would
 * quietly file a whole cohort's ratings against the wrong week.
 */

import {
  currentWeek,
  elapsedWeeks,
  weekEnd,
  weekRangeLabel,
  weekStart,
  weekToRemind,
} from "@/features/05-accountability-tracker/lib/week";

const START = "2026-08-24"; // a Monday
const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("currentWeek", () => {
  it("counts the start date itself as week 1", () => {
    expect(currentWeek(START, 12, utc("2026-08-24"))).toBe(1);
  });

  it("stays in week 1 through the following Sunday", () => {
    expect(currentWeek(START, 12, utc("2026-08-30"))).toBe(1);
  });

  it("rolls to week 2 on the next Monday", () => {
    expect(currentWeek(START, 12, utc("2026-08-31"))).toBe(2);
  });

  it("returns 0 before the project starts, so nothing is rateable yet", () => {
    expect(currentWeek(START, 12, utc("2026-08-23"))).toBe(0);
    expect(currentWeek(START, 12, utc("2026-07-01"))).toBe(0);
  });

  it("clamps past the final week instead of inventing week 13", () => {
    expect(currentWeek(START, 12, utc("2026-11-16"))).toBe(12);
    expect(currentWeek(START, 12, utc("2027-03-01"))).toBe(12);
  });

  it("does not roll over early for a late-evening visit", () => {
    // 11:30pm Central on the Sunday = 04:30 UTC Monday. Still week 1.
    expect(currentWeek(START, 12, new Date("2026-08-31T04:30:00Z"))).toBe(1);
  });
});

describe("weekStart / weekEnd / labels", () => {
  it("spans Monday to Sunday", () => {
    expect(weekStart(START, 1).toISOString().slice(0, 10)).toBe("2026-08-24");
    expect(weekEnd(START, 1).toISOString().slice(0, 10)).toBe("2026-08-30");
    expect(weekStart(START, 3).toISOString().slice(0, 10)).toBe("2026-09-07");
  });

  it("labels the range the way the header reads it", () => {
    expect(weekRangeLabel(START, 1)).toBe("Aug 24 – Aug 30");
  });
});

describe("elapsedWeeks", () => {
  it("lists only weeks that have begun", () => {
    expect(elapsedWeeks(START, 12, utc("2026-09-08"))).toEqual([1, 2, 3]);
  });

  it("is empty before the project starts", () => {
    expect(elapsedWeeks(START, 12, utc("2026-08-01"))).toEqual([]);
  });
});

describe("weekToRemind", () => {
  it("chases the week now closing", () => {
    // Friday of week 2.
    expect(weekToRemind(START, 12, utc("2026-09-04"))).toBe(2);
  });

  it("stays silent before the project starts", () => {
    expect(weekToRemind(START, 12, utc("2026-08-10"))).toBeNull();
  });

  it("stops nagging once the last week is over", () => {
    // Final week 12 ends 2026-11-15.
    expect(weekToRemind(START, 12, utc("2026-11-13"))).toBe(12);
    expect(weekToRemind(START, 12, utc("2026-11-16"))).toBeNull();
    expect(weekToRemind(START, 12, utc("2027-01-05"))).toBeNull();
  });
});
