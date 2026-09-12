import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { excludeOwnApplications } from "@/features/03-recruitment-ats/lib/self-access";
import { resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { breakdownBy, type Dimension } from "@/features/03-recruitment-ats/lib/demographics";
import { cohortOf, gatherEvidence } from "@/features/03-recruitment-ats/lib/cohort";
import { getInterviewPanels } from "@/features/03-recruitment-ats/lib/interview-store";
import { isRound, type Round } from "@/features/03-recruitment-ats/lib/rounds";
import { ALL_STAGES } from "@/features/03-recruitment-ats/lib/types";

// EXEC-ONLY: who is applying, and whether the process treats them the same.
//
// Reports PRONOUNS, which is what the form actually asks for — not gender, which
// it does not. Guessing gender from a first name would be unreliable and is
// something no applicant consented to.
//
// Exec-only, and narrower than the applicant pool every member can read, for a
// reason worth stating: an aggregate that splits a small cohort several ways can
// identify individuals. A single they/them applicant in a stage bucket is named
// by the number 1 as surely as by their name. Exec already sees the whole pool,
// so they learn nothing here they could not already look up — everyone else
// would be learning something new about a person from a chart.
//
// Counts are the least useful part. The point is the stage split and the mean
// score per group: a cohort that is 26% she/her at application and 10% at offer
// is saying something about the process that a headline number never will.
//
// `?round=` scopes the COHORT to the people who reached a round, so the same
// question can be asked of the first and final rounds and not only of the
// applicant pool. It has to be a reach rather than a stage match: an hour after
// exec finishes the first round nobody is at stage `interview` any more, and a
// report keyed on that stage would say the round had no candidates. See
// lib/cohort.ts for how far that inference can be trusted.

export const dynamic = "force-dynamic";

const STAGE_ORDER: string[] = ALL_STAGES;
const DIMENSIONS: Dimension[] = ["pronouns", "major", "college", "year"];

export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isExec(session?.user?.role)) {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const cycle = await resolveCycle(params.get("cycle"));
  // An unknown `by` falls back to pronouns rather than erroring — a stale link
  // should show something useful, not a 400.
  const by = params.get("by");
  const dimension: Dimension = DIMENSIONS.includes(by as Dimension) ? (by as Dimension) : "pronouns";
  // Same forgiving fallback as `by`: a stale link shows the whole pool rather
  // than a 400.
  const roundParam = params.get("round");
  const round: Round = isRound(roundParam) ? roundParam : "written";

  try {
    const { applicants, reviews, demo } = await getSnapshot(cycle);
    // Self-access holds here too. An exec who applied in an earlier cycle is one
    // row in an aggregate rather than a profile, but a group of one still names
    // them, and the rule does not have a size threshold.
    const visible = excludeOwnApplications(email, applicants, (a) => a.email);

    // Panels are fetched only when a round is actually being asked about — they
    // are a third query, and they change the answer for nobody looking at the
    // written pool.
    const panels = round === "written" ? [] : await getInterviewPanels();
    const evidence = gatherEvidence(reviews, panels);
    const cohort = cohortOf(round, visible, evidence);

    return NextResponse.json({
      cycle,
      demo,
      round,
      /** The whole pool, so the UI can say "52 of 328" rather than just "52". */
      poolTotal: visible.length,
      ...breakdownBy(dimension, cohort, reviews, STAGE_ORDER),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build the demographics report" },
      { status: 500 }
    );
  }
}
