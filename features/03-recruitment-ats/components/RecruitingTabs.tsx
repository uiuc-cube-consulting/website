"use client";

// Exec-only shell: the reviewer dashboard and the final-decision queue as two
// tabs on one page, so exec can score and decide without navigating away.
//
// Rendered only for exec (see app/portal/recruiting/page.tsx). Non-exec members
// get RecruitingDashboard directly and never see this shell — the decision queue
// unblinds other reviewers' scores, which is exactly what the screen must not do.

import { useState } from "react";
import { RecruitingDashboard } from "./RecruitingDashboard";
import { DecisionQueue } from "./DecisionQueue";

type Tab = "review" | "decide";

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
        {btn("review", "Review applications", "Score candidates on the written rubric")}
        {btn("decide", "Final decisions", "Both reviewers' verdicts, unblinded")}
      </div>
      {tab === "review" ? <RecruitingDashboard /> : <DecisionQueue />}
    </div>
  );
}
