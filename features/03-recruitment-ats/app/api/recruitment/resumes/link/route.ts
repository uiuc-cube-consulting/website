import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { linkMissingResumes } from "@/features/03-recruitment-ats/lib/interview-store";
import { canAccessRecruiting } from "@/features/03-recruitment-ats/lib/access";
import {
  canViewRecruiting,
  getActiveCycle,
  getImportSheetId,
} from "@/features/03-recruitment-ats/lib/visibility";

// Point every resume-less applicant in the active cycle at the file their Form
// response uploaded.
//
// OPEN TO EVERY MEMBER, unlike the exec-only import and Drive-folder sync. A
// reviewer scores the resume out of 5 — a missing one silently costs a candidate
// points — so whoever opens a candidate and finds nothing there should be able
// to fix it in one click rather than wait for an officer to notice. The action
// reveals nothing: it returns counts, never applicant data, and it can only ever
// FILL a gap, never change or clear a resume that is already linked.
//
// It takes NO PARAMETERS, deliberately. The sheet is read from
// `recruiting_settings.import_sheet_id` (db/resume-linking.sql). If the caller
// could name the sheet, any member could point the service account at an
// arbitrary spreadsheet id and learn from the response whether it was readable —
// an internal maintenance action turned into a probe of what our Google account
// can see. There is one sheet per cycle; exec records it; this reads it.

export const dynamic = "force-dynamic";
// A cohort's worth of Drive metadata lookups, four at a time.
export const maxDuration = 60;

export async function POST() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const role = session?.user?.role;
  if (!canAccessRecruiting(role)) {
    return NextResponse.json({ ok: false, error: "Recruiting access required" }, { status: 403 });
  }
  if (!(await canViewRecruiting(role))) {
    return NextResponse.json({ ok: false, error: "Recruiting is currently closed" }, { status: 403 });
  }

  const sheetId = await getImportSheetId();
  if (!sheetId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No response sheet is recorded for this cycle. An exec can set it when importing applications.",
      },
      { status: 400 }
    );
  }

  const cycle = await getActiveCycle();
  const result = await linkMissingResumes(sheetId, cycle);

  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — nothing linked." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

  // Every bucket is reported, not just the successes: "linked 0" on its own
  // reads as a broken button, when the truthful answer is usually "nobody was
  // missing one" or "those candidates never uploaded a file".
  return NextResponse.json({ ...result, ok: true, cycle });
}
