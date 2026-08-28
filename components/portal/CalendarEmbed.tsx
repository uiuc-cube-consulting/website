"use client";

/**
 * Upcoming club events, read server-side.
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
 */

import { useEffect, useState } from "react";
import type { DisplayDay } from "@/lib/calendar-format";

type ApiResponse = {
  ok?: boolean;
  days: DisplayDay[];
  count?: number;
  error?: string;
  hint?: string;
};

export function CalendarEmbed() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const r = await fetch("/api/calendar", { signal: ctrl.signal });
        const json = await r.json();
        if (!ctrl.signal.aborted) setData(json);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setFailed(true);
      }
    })();
    return () => ctrl.abort();
  }, []);

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

  if (!data.days.length) {
    return (
      <Shell>
        <p className="text-sm text-[var(--muted)]">No events scheduled in the next few months.</p>
      </Shell>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5 md:p-6">
      <div className="space-y-6">
        {data.days.map((day) => (
          <div key={day.key}>
            <p className="eyebrow">{day.label}</p>
            <ul className="mt-2 space-y-2">
              {day.events.map((e) => (
                <li
                  key={e.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 px-4 py-3"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-semibold text-[var(--bg-dark)]">{e.title}</p>
                    <span className="text-xs font-medium text-[var(--gold-deep)]">{e.time}</span>
                  </div>
                  {e.through && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{e.through}</p>
                  )}
                  {e.location && (
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{e.location}</p>
                  )}
                  {e.description && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">{e.description}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 md:p-10 text-center">
      {children}
    </div>
  );
}
