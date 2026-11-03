"use client";

// The one recruiting page: every round, as tabs. The written round (review
// dashboard + its decision queue) and the two interview rounds (the interview
// console) used to be two pages, /portal/recruiting and /portal/interview; they
// are one now so nobody has to know which page a round lives on.
//
// Which tabs render is decided by the server page (app/portal/recruiting/page.tsx)
// and passed in. Exec get everything. Everyone else gets the review dashboard and
// the interview console only — the decision queue unblinds other reviewers'
// scores, which is exactly what the screen must not do. Every exec check is
// repeated in the API; this only decides what is rendered.
//
// The interview console stays scoped to one round inside its own tab: the first
// round is staffed from the whole recruiting pool, the final round is exec only,
// enforced per-round in the routes (lib/rounds.ts).

import { useState } from "react";
import { RecruitingDashboard } from "./RecruitingDashboard";
import { DecisionQueue } from "./DecisionQueue";
import { InterviewConsole } from "./InterviewConsole";
import { VisibilityToggle } from "./VisibilityToggle";
import { DemographicsPanel } from "./DemographicsPanel";
import type { RecruitingTab } from "@/features/03-recruitment-ats/lib/recruiting-tabs";

export function RecruitingTabs({
  isExec,
  canInterview,
  initialTab = "review",
}: {
  isExec: boolean;
  canInterview: boolean;
  initialTab?: RecruitingTab;
}) {
  // `false &&` entries are filtered out, so each line reads as "who gets this".
  const tabs = [
    { id: "review", label: "Review applications", hint: "Score candidates on the 28-point written rubric" },
    isExec && { id: "decide", label: "Written decisions", hint: "Both readers' verdicts, unblinded — advance to the first round or reject" },
    canInterview && { id: "interviews", label: "Interviews", hint: "Resume, case rubric, and behavioral rubric for the candidate you're interviewing" },
    isExec && { id: "demographics", label: "Demographics", hint: "Who applied, and how each group moves through the pipeline" },
    isExec && { id: "visibility", label: "Visibility", hint: "Open or close recruiting for everyone else" },
  ].filter(Boolean) as { id: RecruitingTab; label: string; hint: string }[];

  // A deep link to a tab this viewer can't see (e.g. ?tab=decide for a non-exec)
  // falls back to the review dashboard rather than rendering nothing.
  const [tab, setTab] = useState<RecruitingTab>(
    tabs.some((t) => t.id === initialTab) ? initialTab : "review"
  );

  const select = (id: RecruitingTab) => {
    setTab(id);
    // Keep the URL in step so a refresh or a shared link lands on the same tab.
    // replaceState, not the router: switching tabs is not a navigation.
    const url = new URL(window.location.href);
    if (id === "review") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, hint }) => (
          <button
            key={id}
            onClick={() => select(id)}
            className={
              "rounded-full px-4 py-2 text-xs font-semibold transition " +
              (tab === id
                ? "bg-[var(--gold)] text-[var(--bg-dark)]"
                : "border border-[var(--border)] text-[var(--muted)] hover:bg-white")
            }
            title={hint}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "review" && (
        <>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--bg-dark)]">Round 1 · Written applications.</span>{" "}
            Everything the form asked for, plus the resume, scored out of 28 points: three essays,
            the case essay, a miscellaneous mark, and the resume itself. Two independent readers per
            application, and your scores stay yours until you submit.
          </p>
          <RecruitingDashboard />
        </>
      )}
      {tab === "decide" && <DecisionQueue />}
      {tab === "interviews" && (
        <>
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--bg-dark)]">Rounds 2 and 3 · Interviews.</span>{" "}
            Search the candidate you&rsquo;re about to interview and get their resume, case rubric, and
            behavioral rubric on one screen. Your rubrics are yours — you fill in a copy for the
            people you&rsquo;re interviewing, and the templates stay untouched. The first round is
            staffed from the whole recruiting pool; the final round is exec only.
          </p>
          <InterviewConsole />
        </>
      )}
      {tab === "demographics" && <DemographicsPanel />}
      {tab === "visibility" && <VisibilityToggle />}
    </div>
  );
}
