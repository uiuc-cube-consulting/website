import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { excludeOwnApplications } from "@/features/03-recruitment-ats/lib/self-access";
import { resolveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { SCREEN_MAX_POINTS, STAGES, type Stage } from "@/features/03-recruitment-ats/lib/types";
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
// Exec-only rather than open to every recruiting role, unlike the dashboard.
// Reading the pool inside the portal is one thing; a downloadable file of 328
// names, addresses and scores is another — it leaves the app, gets forwarded,
// and outlives the cycle. That is a narrower privilege, so it takes the narrower
// gate, and it is the same set of people who already decide stages.

export const dynamic = "force-dynamic";

const VALID_STAGES: string[] = [...STAGES, "rejected", "withdrawn"];

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

  try {
    const { applicants, reviews, flags } = await getSnapshot(cycle, email, session?.user?.role);

    // Your own application is not yours to read, and that does not stop being
    // true because the read is a file download (lib/self-access.ts). An exec who
    // applied in an earlier cycle must not be able to export their own scores.
    const visible = excludeOwnApplications(email, applicants, (a) => a.email);
    const rows = (stage ? visible.filter((a) => a.stage === stage) : visible)
      // Alphabetical: a decision-email list is worked through by name, and the
      // dashboard's score ordering means nothing once it is in a spreadsheet.
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => toExportRow(a, reviews, flags, SCREEN_MAX_POINTS));

    const csv = toCsv([...EXPORT_HEADERS], rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${exportFilename(cycle, stage)}"`,
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
