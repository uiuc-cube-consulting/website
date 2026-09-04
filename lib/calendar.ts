// Server-only Google Calendar reader. Imports `googleapis` — never import from
// client code.
//
// Why we fetch server-side instead of embedding Google's iframe:
//
//   The iframe renders with the VIEWER's Google session inside a third-party
//   frame. For a calendar that is not public, that fails in two ways nobody can
//   fix from our side — the embed loads account index 0, so a member whose
//   university account is not their first Google account sees nothing; and
//   Safari (plus Chrome, increasingly) blocks third-party cookies, so the frame
//   cannot see their Google session at all and falls back to showing only public
//   events. Both render as an EMPTY calendar with no error, while the same
//   person sees a full month on calendar.google.com.
//
//   Reading it here with the service account removes the viewer's browser from
//   the problem entirely. The calendar stays private, and the portal's own
//   sign-in becomes the real gate.
//
// Setup (both required, and both fail loudly below if missed):
//   1. Enable the Google Calendar API in the cube-project-496921 GCP project.
//   2. Share the calendar with the service account's client_email, "See all
//      event details".

import { google } from "googleapis";
import { normalizeEvents, type CalendarEvent, type RawEvent } from "./calendar-format";

const SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"];

/** Default calendar, overridable per call. */
export function defaultCalendarId(): string {
  return (process.env.CALENDAR_ID || "").trim();
}

function client() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) return null;
  try {
    const creds = JSON.parse(saJson);
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: SCOPES,
    });
    return google.calendar({ version: "v3", auth });
  } catch {
    return null;
  }
}

export type CalendarResult =
  | { ok: true; events: CalendarEvent[] }
  | { ok: false; error: string; hint?: string };

export type FetchOptions = {
  calendarId?: string;
  /** How far ahead to look. Ignored when `from`/`to` are given. */
  days?: number;
  maxResults?: number;
  /** Injectable for tests. */
  now?: Date;
  /**
   * An explicit window, for the month grid.
   *
   * The default window starts at `now`, which is right for an upcoming-events
   * list and wrong for a calendar: opening the grid on the 20th would blank out
   * the first three weeks of the month you are looking at. Passing `from`
   * overrides that, and is the only way to see a day that has already happened.
   */
  from?: Date;
  to?: Date;
};

/**
 * Upcoming events, soonest first.
 *
 * `singleEvents` expands recurring series into individual instances, which is
 * what a member wants to see — without it a weekly GBM returns as one row with a
 * recurrence rule we would have to expand ourselves.
 */
export async function fetchUpcomingEvents(opts: FetchOptions = {}): Promise<CalendarResult> {
  const cal = client();
  if (!cal) {
    return {
      ok: false,
      error: "Calendar is not configured.",
      hint: "Set GOOGLE_SERVICE_ACCOUNT_JSON.",
    };
  }
  const calendarId = (opts.calendarId || defaultCalendarId()).trim();
  if (!calendarId) {
    return {
      ok: false,
      error: "No calendar configured.",
      hint: "Set CALENDAR_ID to the calendar's address (e.g. cubeuiuc@gmail.com).",
    };
  }

  const now = opts.now ?? new Date();
  const timeMin = opts.from ?? now;
  const timeMax = opts.to ?? (() => {
    const horizon = new Date(timeMin);
    horizon.setDate(horizon.getDate() + (opts.days ?? 120));
    return horizon;
  })();

  try {
    const res = await cal.events.list({
      calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: opts.maxResults ?? 50,
    });
    return { ok: true, events: normalizeEvents((res.data.items ?? []) as RawEvent[]) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    // The two setup mistakes produce opaque Google errors. Name them, because
    // "Not Found" on a calendar that plainly exists is genuinely baffling.
    if (/has not been used in project|is disabled/i.test(msg)) {
      return {
        ok: false,
        error: "The Google Calendar API is not enabled for this project.",
        hint: "Enable it in Google Cloud → cube-project-496921 → APIs & Services → Library.",
      };
    }
    if (/not ?found|404/i.test(msg)) {
      return {
        ok: false,
        error: `The service account cannot see "${calendarId}".`,
        hint: "Share the calendar with the service account's client_email as \"See all event details\".",
      };
    }
    if (/forbidden|403|insufficient/i.test(msg)) {
      return {
        ok: false,
        error: "The service account is not allowed to read this calendar.",
        hint: "Re-share it with \"See all event details\" rather than \"See only free/busy\".",
      };
    }
    return { ok: false, error: msg };
  }
}
