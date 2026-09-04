import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchUpcomingEvents } from "@/lib/calendar";
import { toDisplayDays, todayKey, CLUB_TIME_ZONE } from "@/lib/calendar-format";

// Members-only: club events, read server-side with the service account.
//
// Any signed-in member may see the schedule — it is the same information the
// calendar itself carries, and the portal sign-in is the gate. Nothing here is
// role-specific.
//
// Two windows, chosen by the caller:
//   (no params)        the CURRENT club month, past days included — what the
//                      grid opens on, and the default because the grid is the
//                      default view.
//   ?month=YYYY-MM     that month instead.
//   ?window=upcoming   events from now forward — what the list view wants.
//
// The no-param case deliberately is not "upcoming". The browser cannot know the
// club's current month before it has heard from us, so making the grid's own
// default free is what keeps opening the dashboard to ONE Google call rather
// than two — a request to learn the date, then a request for the month.

export const dynamic = "force-dynamic";
// The calendar changes on human timescales; a short cache keeps a busy portal
// from making a Google request per page view.
export const revalidate = 300;

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const upcoming = params.get("window") === "upcoming";

  const requested = params.get("month")?.trim();
  // An unparseable month falls back to the current one rather than erroring: the
  // member asked for a calendar, and showing them this month is a better answer
  // than a stack trace.
  const month = upcoming
    ? null
    : requested && MONTH_PATTERN.test(requested)
      ? requested
      : todayKey(CLUB_TIME_ZONE).slice(0, 7);

  const result = await fetchUpcomingEvents(
    month
      ? {
          // Widened past the month's own bounds — see the helpers below.
          from: monthStartInclusive(month),
          to: monthEndExclusive(month),
          // A month of a busy club calendar can exceed the list's default 50.
          maxResults: 250,
        }
      : {}
  );

  if (!result.ok) {
    // 200 with an error payload, not 5xx: a missing share is a setup state, not
    // a server fault, and the UI renders it as guidance rather than a crash.
    return NextResponse.json({ ok: false, error: result.error, hint: result.hint, days: [] });
  }

  return NextResponse.json({
    ok: true,
    days: toDisplayDays(result.events, CLUB_TIME_ZONE),
    count: result.events.length,
    timeZone: CLUB_TIME_ZONE,
    month,
    // Which cell to ring as "today". Sent from here because the browser's idea
    // of the date is its own timezone's — a member in another zone over break
    // would otherwise highlight the wrong day.
    today: todayKey(CLUB_TIME_ZONE),
  });
}

// A week of slack at each end, deliberately. The grid's first and last rows
// borrow days from the adjacent months to complete the weeks, and a request for
// exactly [1st, 1st) would leave those cells empty even when something is on
// them — an event would appear to vanish for the few days it sits in a
// neighbouring month's tail.

function monthStartInclusive(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  // Seven days before the 1st, covering the leading edge cells borrowed from
  // the previous month.
  return new Date(Date.UTC(y, m - 1, 1 - 7));
}

function monthEndExclusive(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  // Month index `m` (0-based) is the month AFTER `m - 1`, so this is the 1st of
  // the following month; the +7 days covers the trailing edge cells.
  return new Date(Date.UTC(y, m, 8));
}
