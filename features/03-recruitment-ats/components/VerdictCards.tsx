"use client";

// Both written readers' rubrics and notes, side by side and unblinded.
//
// Extracted so the two exec surfaces that unblind a written review cannot drift
// into showing different things: the decision queue, where the call is made, and
// the candidate panel in the reviewer console, where a call already made has to
// be explained back to the candidate who asks why. A rejected applicant emailing
// for feedback is asking about exactly the rows exec read when deciding, so they
// should be the same rows, rendered the same way.
//
// Presentational only — it never fetches and never decides who may look. Both
// callers already hold the verdicts, and both routes that produce them are
// exec-only.

import { RUBRIC, SCREEN_MAX_POINTS } from "@/features/03-recruitment-ats/lib/types";
import type { ReviewerVerdict } from "@/features/03-recruitment-ats/lib/decision";

export function VerdictCards({
  verdicts,
  empty = "No written reviews submitted yet.",
  /** Grid classes for the card row. The decision queue is full-width and takes
   *  two columns; the console's detail panel is a narrow rail at lg and stacks. */
  columns = "sm:grid-cols-2",
}: {
  verdicts: ReviewerVerdict[];
  empty?: string;
  columns?: string;
}) {
  if (verdicts.length === 0) {
    return <p className="text-xs text-[var(--muted)]">{empty}</p>;
  }

  return (
    <div className={`grid gap-3 ${columns}`}>
      {verdicts.map((v) => (
        <div
          key={v.reviewer_email}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-semibold text-[var(--bg-dark)]">{v.reviewer_email}</p>
            <span className="shrink-0 text-xs font-semibold">
              {v.weighted_total} / {SCREEN_MAX_POINTS}
            </span>
          </div>
          <ul className="mt-2 space-y-0.5">
            {RUBRIC.map((c) => (
              <li key={c.key} className="flex justify-between gap-2 text-[11px] text-[var(--muted)]">
                <span>{c.label}</span>
                <span className="font-medium text-[var(--bg-dark)]">
                  {v.scores[c.key] ?? "—"}
                  <span className="font-normal text-[var(--muted)]">/{c.max}</span>
                </span>
              </li>
            ))}
          </ul>
          {v.notes && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--bg-dark)]">{v.notes}</p>
          )}
        </div>
      ))}
    </div>
  );
}
