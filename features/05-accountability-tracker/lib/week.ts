// Semester week math. Pure — no clock reads except the caller's `today`, so the
// tests can pin a date and the reminder job and the UI agree on what "this week"
// means.
//
// A project stores `starts_on` (the Monday of Week 1) and `weeks`. Everything
// else is derived, which is the whole point: nobody opens or closes a week by
// hand, and a PM who logs in on Thursday of week 3 lands on week 3.

const MS_PER_DAY = 86_400_000;

/**
 * The club is in Champaign, so a week rolls over at midnight Central — not at
 * midnight UTC, which is 7pm the previous evening here. A PM rating on Sunday
 * night must still land in the week they think they're in.
 */
const ORG_TIMEZONE = "America/Chicago";

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORG_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date in Champaign, as a UTC-midnight timestamp for comparison. */
function localDay(date: Date): number {
  const [y, m, d] = DAY_FORMAT.format(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Parse an ISO `YYYY-MM-DD` as a UTC midnight date, ignoring any time part. */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Which semester week `today` falls in, 1-based.
 *
 * Returns 0 before the project starts (nothing to rate yet) and clamps to
 * `weeks` after it ends — a PM opening a finished project sees its last week
 * rather than a week that was never real.
 */
export function currentWeek(startsOn: string, weeks: number, today: Date = new Date()): number {
  const start = parseISODate(startsOn);
  // Compare calendar day to calendar day, both anchored in Champaign, so a
  // late-evening visit doesn't roll the week over early.
  const diffDays = Math.floor((localDay(today) - start.getTime()) / MS_PER_DAY);
  if (diffDays < 0) return 0;
  return Math.min(Math.floor(diffDays / 7) + 1, weeks);
}

/** Monday of the given semester week. */
export function weekStart(startsOn: string, week: number): Date {
  const start = parseISODate(startsOn);
  return new Date(start.getTime() + (week - 1) * 7 * MS_PER_DAY);
}

/** Sunday of the given semester week. */
export function weekEnd(startsOn: string, week: number): Date {
  return new Date(weekStart(startsOn, week).getTime() + 6 * MS_PER_DAY);
}

/** "Aug 24 – Aug 30" — the header line under "Week 1". */
export function weekRangeLabel(startsOn: string, week: number): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${fmt(weekStart(startsOn, week))} – ${fmt(weekEnd(startsOn, week))}`;
}

/** Every week that has begun, oldest first. Empty before the project starts. */
export function elapsedWeeks(startsOn: string, weeks: number, today: Date = new Date()): number[] {
  const current = currentWeek(startsOn, weeks, today);
  return Array.from({ length: current }, (_, i) => i + 1);
}

/**
 * The week the reminder job should chase.
 *
 * It runs at the END of a week (Friday), so the week being nagged about is the
 * one now closing — the current one. Before the project starts, or once the
 * semester is over, there is nothing to chase and this returns null so the job
 * skips the project rather than emailing about week 0 or a week past the end.
 */
export function weekToRemind(startsOn: string, weeks: number, today: Date = new Date()): number | null {
  const week = currentWeek(startsOn, weeks, today);
  if (week < 1) return null;
  // currentWeek clamps, so past the final week it keeps returning `weeks`. Stop
  // nagging once that last week is itself over.
  const finalWeekEnd = weekEnd(startsOn, weeks);
  if (localDay(today) > finalWeekEnd.getTime()) return null;
  return week;
}
