import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isExec } from "@/features/02-pipeline-crm/lib/pipeline";
import { importFromSheet } from "@/features/02-pipeline-crm/lib/store";

// Exec-only: sync the bot's Leads sheet into the Supabase pipeline store. New leads
// are inserted; existing leads keep their human-edited stage/notes/custom/position.

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isExec(session)) return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });

  const result = await importFromSheet();
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — nothing imported." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, inserted: result.inserted, updated: result.updated });
}
