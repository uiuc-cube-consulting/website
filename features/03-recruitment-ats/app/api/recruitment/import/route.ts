import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { importApplicants } from "@/features/03-recruitment-ats/lib/store";
import { readApplicantsFromSheet } from "@/features/03-recruitment-ats/lib/import";
import { normalizeCycle } from "@/features/03-recruitment-ats/lib/cycle";
import { getActiveCycle, setImportSheetId } from "@/features/03-recruitment-ats/lib/visibility";

// Exec-only: read a Google Sheet of form responses and import them as applicants,
// into the ACTIVE cycle unless one is named. This is the front door of the WRITTEN
// round: it brings in every column the form asked for, plus a pointer to the
// resume the response uploaded, which is what the written rubric scores.
//
// Pass { sheetId, range?, cycle? } in the body, or set RECRUITMENT_IMPORT_SHEET_ID.
// Safe to re-run — an email already in this cycle is skipped.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "exec") return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: { sheetId?: string; range?: string; cycle?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* fall back to env */
  }
  const sheetId = (body.sheetId || process.env.RECRUITMENT_IMPORT_SHEET_ID || "").trim();
  if (!sheetId) return NextResponse.json({ ok: false, error: "Provide a sheet URL or id." }, { status: 400 });

  const read = await readApplicantsFromSheet(sheetId, body.range);
  if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: 400 });

  // Remember which sheet this cycle came from. "Link missing resumes" is open to
  // every member and therefore takes no sheet parameter — it reads this. Recorded
  // on a SUCCESSFUL read, so a typo'd id is never stored. Failing to store it must
  // not fail the import, which is the thing the caller actually asked for.
  await setImportSheetId(sheetId, session.user.email.toLowerCase()).catch(() => {});

  const cycle = normalizeCycle(body.cycle) ?? (await getActiveCycle());
  const result = await importApplicants(read.rows, cycle);
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — nothing imported." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  // `flagsLinked` is the event flags that just attached themselves to the people
  // in this import — worth reporting, because it is the only visible sign that
  // the pending pool did its job. `resumesLinked` is the same idea for resumes:
  // it is how exec knows the written round can actually see what it is scoring.
  // Reconciliation, not just a total. When the spreadsheet's row count and the
  // imported count disagree, every number needed to explain the gap is here:
  //
  //   sheetRows  = non-empty rows in the sheet          (what you can count by eye)
  //   noEmail    = dropped before import, by sheet row  (email is the dedupe key)
  //   read       = rows handed to the importer          = sheetRows - noEmail.length
  //   inserted   + skipped                              = read
  //   skipped    = invalidEmail + duplicateInSheet + alreadyInCycle
  //
  // so `sheetRows` always accounts for itself, and the missing rows are named
  // rather than merely counted.
  const detail = result.skippedDetail;
  return NextResponse.json({
    ok: true,
    cycle,
    sheetRows: read.totalRows,
    noEmail: read.droppedNoEmail,
    read: read.total,
    inserted: result.inserted,
    skipped: result.skipped,
    skippedDetail: detail,
    reconcile: detail
      ? {
          sheetRows: read.totalRows,
          droppedNoEmail: read.droppedNoEmail.length,
          invalidEmail: detail.invalidEmail.length,
          duplicateInSheet: detail.duplicateInSheet.length,
          alreadyInCycle: detail.alreadyInCycle.length,
          inserted: result.inserted ?? 0,
        }
      : undefined,
    flagsLinked: result.flagsLinked ?? 0,
    resumesLinked: result.resumesLinked ?? 0,
  });
}
