import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { excludeOwnApplications } from "@/features/03-recruitment-ats/lib/self-access";
import { resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { ALL_STAGES, SCREEN_MAX_POINTS, type Stage } from "@/features/03-recruitment-ats/lib/types";
import { cohortOf, deepestRound, gatherEvidence } from "@/features/03-recruitment-ats/lib/cohort";
import { getInterviewPanels } from "@/features/03-recruitment-ats/lib/interview-store";
import { isRound, type Round } from "@/features/03-recruitment-ats/lib/rounds";
import {
  EXPORT_HEADERS,
  exportFilename,
  toCsv,
  toExportRow,
} from "@/features/03-recruitment-ats/lib/export";

// EXEC-ONLY: the cycle as a spreadsheet — who was rejected, who advanced, and
// the scores behind each call. Built for sending decision emails and for keeping
// a record of a cycle after the portal has moved on to the next one.
//
// `?stage=rejected` narrows to one outcome, which is the common case: you are
// writing to the people you turned down, or to the people who got through, and
// mixing them in one file is how the wrong template reaches the wrong person.
//
// `?round=` narrows to the people who REACHED a round, and the two compose into
// the query this actually gets asked for: `?round=first_round&stage=rejected` is
// "everyone we interviewed and then turned down", which is a different letter
// and a different list from everyone rejected on their written application.
// Stage alone cannot express it — both groups sit at `rejected` — so the round
// is inferred from what each round left behind. See lib/cohort.ts.
//
// Exec-only rather than open to every recruiting role, unlike the dashboard.
// Reading the pool inside the portal is one thing; a downloadable file of 328
// names, addresses and scores is another — it leaves the app, gets forwarded,
// and outlives the cycle. That is a narrower privilege, so it takes the narrower
// gate, and it is the same set of people who already decide stages.

export const dynamic = "force-dynamic";

const VALID_STAGES: string[] = ALL_STAGES;

export async function GET(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isExec(session?.user?.role)) {
    return NextResponse.json({ error: "Exec only" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const cycle = await resolveCycle(params.get("cycle"));
  const stageParam = params.get("stage");
  const stage = stageParam && VALID_STAGES.includes(stageParam) ? (stageParam as Stage) : null;
  const roundParam = params.get("round");
  const round: Round | null = isRound(roundParam) ? roundParam : null;

  try {
    const { applicants, reviews, flags } = await getSnapshot(cycle, email, session?.user?.role);

    // Your own application is not yours to read, and that does not stop being
    // true because the read is a file download (lib/self-access.ts). An exec who
    // applied in an earlier cycle must not be able to export their own scores.
    const visible = excludeOwnApplications(email, applicants, (a) => a.email);

    // Panels only when a round is being asked about — a third query that changes
    // the answer for nobody exporting the whole pool.
    const evidence =
      round && round !== "written"
        ? gatherEvidence(reviews, await getInterviewPanels())
        : null;

    /**
     * How `round` and `stage` combine.
     *
     * On a terminal stage the round means "LEFT AFTER this round", not merely
     * "reached it". The two differ the moment a cycle has more than one round of
     * rejections: someone turned down after their final interview also reached
     * the first round, so a plain reach filter would put them in the file named
     * for first-round rejections — and that file is a mailing list. The letter
     * you send to somebody cut after one interview is not the letter you send to
     * somebody cut after two.
     *
     * On any other stage "reached" is the right reading and the only sensible
     * one: `round=first_round&stage=final_round` means the people who came
     * through the first round, which is where they are now.
     */
    const terminal = stage === "rejected" || stage === "withdrawn";
    const selected =
      evidence && round && round !== "written" && terminal
        ? visible.filter((a) => a.stage === stage && deepestRound(a, evidence) === round)
        : (() => {
            const inRound = evidence && round && round !== "written"
              ? cohortOf(round, visible, evidence)
              : visible;
            return stage ? inRound.filter((a) => a.stage === stage) : inRound;
          })();

    const rows = selected
      // Alphabetical: a decision-email list is worked through by name, and the
      // dashboard's score ordering means nothing once it is in a spreadsheet.
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => toExportRow(a, reviews, flags, SCREEN_MAX_POINTS));

    const csv = toCsv([...EXPORT_HEADERS], rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(cycle, stage, new Date(), round)}"`,
        // Applicant PII — never let it settle in a shared cache.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to build the export" },
      { status: 500 }
    );
  }
}
