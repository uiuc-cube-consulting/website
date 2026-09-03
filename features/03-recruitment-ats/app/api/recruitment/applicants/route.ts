import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAssignments, getSnapshot, listCycles } from "@/features/03-recruitment-ats/lib/store";
import { cycleLabel } from "@/features/03-recruitment-ats/lib/cycle";
import { aggregate, funnel, SCREEN_MAX_POINTS, type Review } from "@/features/03-recruitment-ats/lib/types";
import { canAccessRecruiting, isExec } from "@/features/03-recruitment-ats/lib/access";
import { ROUND_STAGES, roundOfStage } from "@/features/03-recruitment-ats/lib/rounds";
import { canViewRecruiting, resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { excludeOwnApplications } from "@/features/03-recruitment-ats/lib/self-access";
import { computeCoverage, summarizeCoverage } from "@/features/03-recruitment-ats/lib/assignment";

// Auth-gated WRITTEN-ROUND reviewer feed. Returns per-applicant aggregates (mean,
// spread, per-criterion — all in points out of 28) plus the CURRENT reviewer's own
// review — never other reviewers' individual scores/notes, so review stays
// blind-ish until you submit. Also marks which applicants are assigned to the
// current reviewer and their review progress.
//
// Every applicant carries the round they are currently in, so the console can
// separate the written pool from people already in interviews rather than
// presenting one undifferentiated list.
//
// FINAL-ROUND CANDIDATES ARE OMITTED FOR EVERYONE BUT EXEC. The final round is
// exec-only in every direction, and that has to include the roster: knowing who is
// still in it a week before offers go out is most of the information. Exec sees
// them here and works them in the interview console.

export const dynamic = "force-dynamic";

export async function GET(req?: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = session?.user?.role;
  // proxy.ts keeps a plain member off /portal/recruiting, but that is a redirect,
  // not a boundary — this feed carries applicant names, emails and essay answers,
  // so the role is re-checked here where it actually matters.
  if (!canAccessRecruiting(role)) {
    return NextResponse.json({ error: "Recruiting access required" }, { status: 403 });
  }
  if (!(await canViewRecruiting(role))) {
    return NextResponse.json({ error: "Recruiting is currently closed" }, { status: 403 });
  }

  try {
    // ONE cohort at a time, defaulting to the cycle recruiting is running.
    // Mixing cycles is not a display preference: a funnel counting fa26 and
    // sp27 together, or a candidate appearing twice because they applied twice,
    // describes nothing. `?cycle=` opens a past cohort — the point of storing a
    // cycle per application rather than clearing the table each semester.
    const cycle = await resolveCycle(req ? new URL(req.url).searchParams.get("cycle") : null);
    const snapshot = await getSnapshot(cycle, email, role);
    const { reviews, flags, demo } = snapshot;
    const exec = isExec(role);
    const roster = exec
      ? snapshot.applicants
      : snapshot.applicants.filter((a) => a.stage !== "final_round");

    // Your own application is not yours to read (lib/self-access.ts). Almost
    // everyone here applied here, so without this a member finds themselves in
    // an old cohort and reads the marks two of their now-teammates gave them,
    // the spread between those two, and the flags filed about them at a callout.
    //
    // Redacted HERE, at the source, so the coverage table, the aggregates and
    // the reviewer's queue are all derived from a set that never contained it.
    // Excluding it in each of those separately is how one of them ends up not
    // doing so. Composes on top of the final-round filter above rather than
    // replacing it — the two restrictions are unrelated and both apply.
    //
    // No exec bypass, unlike every other gate in lib/access.ts: the point is to
    // withhold information from one specific person, and that person being exec
    // makes the leak worse rather than more legitimate.
    const applicants = excludeOwnApplications(email, roster, (a) => a.email);
    const assignments = await getAssignments();
    const mine = new Set(
      assignments.filter((a) => a.reviewer_email.toLowerCase() === email).map((a) => a.applicant_id)
    );

    // Coverage is folded into the same payload rather than fetched separately:
    // this route already has all three inputs, and the dashboard needs the gap
    // shown next to the candidate it belongs to.
    const coverage = computeCoverage(
      applicants.map((a) => ({ id: a.id, name: a.name, email: a.email, stage: a.stage })),
      assignments,
      reviews
    );
    const coverageById = new Map(coverage.map((c) => [c.applicant_id, c]));

    const rows = applicants.map((a) => {
      const agg = aggregate(a, reviews);
      const cov = coverageById.get(a.id);
      const myReview: Review | undefined = reviews.find(
        (r) => r.applicant_id === a.id && r.reviewer_email.toLowerCase() === email
      );
      return {
        ...agg,
        round: roundOfStage(a.stage),
        hasReviewed: Boolean(myReview),
        assignedToMe: mine.has(a.id),
        assignedReviewers: cov?.assigned ?? [],
        reviewedBy: cov?.reviewed ?? [],
        outstanding: cov?.outstanding ?? [],
        underAssigned: cov?.underAssigned ?? true,
        underReviewed: cov?.underReviewed ?? true,
        myReview: myReview ? { scores: myReview.scores, notes: myReview.notes ?? "" } : null,
        flags: flags.filter((f) => f.applicant_id === a.id),
      };
    });

    // Progress over the current reviewer's assigned queue.
    const assigned = rows.filter((r) => r.assignedToMe);
    const reviewed = assigned.filter((r) => r.hasReviewed).length;
    const progress = { assigned: assigned.length, reviewed, pending: assigned.length - reviewed };

    return NextResponse.json({
      applicants: rows,
      // Counted over EVERY applicant — including the final-round ones hidden
      // from the roster above AND the viewer's own application. A funnel built
      // from the filtered list would show a non-exec "Final round 0" sitting
      // under a non-zero "Offer", which is not a privacy boundary so much as a
      // wrong number. A stage tally names nobody; the roster, which does, stays
      // restricted.
      //
      // The same reasoning covers self-exclusion, and it is worth being explicit
      // because the coverage summary a few lines down goes the OTHER way. A
      // funnel is a reporting number, so it should be right: "5 people reached
      // offer" tells you nothing about whether you are one of them. Coverage is
      // a to-do list, so it has to match the rows you can actually act on — a
      // count that includes a candidate you cannot see is a task you can never
      // close. Different kinds of number, different answers.
      funnel: funnel(snapshot.applicants),
      demo,
      // Which cohort this payload describes, plus every cohort that has
      // applications — so the console can say "Fall 2026" above the list and
      // offer the others, instead of showing an undated pool that silently
      // changes meaning at the turn of a semester.
      cycle,
      cycleLabel: cycleLabel(cycle),
      cycles: (await listCycles()).map((c) => ({ cycle: c, label: cycleLabel(c) })),
      reviewer: email,
      progress,
      hasAssignments: assignments.length > 0,
      canManage: exec,
      maxPoints: SCREEN_MAX_POINTS,
      // Coverage is a WRITTEN-round measure: it answers "who is not yet safe to
      // decide on". A candidate already in interviews has been decided on, so
      // counting them here would leave a gap that can never be closed.
      coverage: summarizeCoverage(
        coverage.filter((c) => (ROUND_STAGES.written as readonly string[]).includes(c.stage))
      ),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load applicants" },
      { status: 500 }
    );
  }
}
