import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { excludeOwnApplications } from "@/features/03-recruitment-ats/lib/self-access";
import { resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { demographicsReport } from "@/features/03-recruitment-ats/lib/demographics";
import { STAGES } from "@/features/03-recruitment-ats/lib/types";

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

export const dynamic = "force-dynamic";

const STAGE_ORDER: string[] = [...STAGES, "rejected", "withdrawn"];

export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isExec(session?.user?.role)) {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }

  const cycle = await resolveCycle(new URL(req.url).searchParams.get("cycle"));

  try {
    const { applicants, reviews, demo } = await getSnapshot(cycle);
    // Self-access holds here too. An exec who applied in an earlier cycle is one
    // row in an aggregate rather than a profile, but a group of one still names
    // them, and the rule does not have a size threshold.
    const visible = excludeOwnApplications(email, applicants, (a) => a.email);
    return NextResponse.json({
      cycle,
      demo,
      ...demographicsReport(visible, reviews, STAGE_ORDER),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build the demographics report" },
      { status: 500 }
    );
  }
}
