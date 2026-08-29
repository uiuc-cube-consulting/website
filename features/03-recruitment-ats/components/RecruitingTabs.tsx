"use client";

// Exec-only shell for the WRITTEN round: the reviewer dashboard and the round's
// decision queue as two tabs on one page, so exec can score and decide without
// navigating away.
//
// The two interview rounds live in /portal/interview instead. They are a different
// job with a different room — a scheduled panel rather than two blind readers — and
// the final round is exec-only in a way this page is not.
//
// Rendered only for exec (see app/portal/recruiting/page.tsx). Non-exec members
// get RecruitingDashboard directly and never see this shell — the decision queue
// unblinds other reviewers' scores, which is exactly what the screen must not do.

import { useState } from "react";
import { RecruitingDashboard } from "./RecruitingDashboard";
import { DecisionQueue } from "./DecisionQueue";
import { VisibilityToggle } from "./VisibilityToggle";

type Tab = "review" | "decide" | "visibility";

export function RecruitingTabs() {
  const [tab, setTab] = useState<Tab>("review");

  const btn = (id: Tab, label: string, hint: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
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
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {btn("review", "Review applications", "Score candidates on the 28-point written rubric")}
        {btn("decide", "Written decisions", "Both readers' verdicts, unblinded — advance to the first round or reject")}
        {btn("visibility", "Visibility", "Open or close recruiting for everyone else")}
      </div>
      {tab === "review" && <RecruitingDashboard />}
      {tab === "decide" && <DecisionQueue />}
      {tab === "visibility" && <VisibilityToggle />}
    </div>
  );
}
