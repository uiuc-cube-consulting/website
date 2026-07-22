import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { importApplicants } from "@/features/03-recruitment-ats/lib/store";
import { readApplicantsFromSheet } from "@/features/03-recruitment-ats/lib/import";

// Exec-only: read a Google Sheet of form responses and import them as applicants
// (deduped by email). Pass { sheetId, range? } in the body, or set
// RECRUITMENT_IMPORT_SHEET_ID. Safe to re-run — existing emails are skipped.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "exec") return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  let body: { sheetId?: string; range?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* fall back to env */
  }
  const sheetId = (body.sheetId || process.env.RECRUITMENT_IMPORT_SHEET_ID || "").trim();
  if (!sheetId) return NextResponse.json({ ok: false, error: "Provide a sheet URL or id." }, { status: 400 });

  const read = await readApplicantsFromSheet(sheetId, body.range);
  if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: 400 });

  const result = await importApplicants(read.rows);
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — nothing imported." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, read: read.total, inserted: result.inserted, skipped: result.skipped });
}
