import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { cycleLabel, nextRecruitingCycle } from "@/features/03-recruitment-ats/lib/cycle";
import {
  getActiveCycle,
  isRecruitingVisible,
  setActiveCycle,
  setRecruitingVisible,
} from "@/features/03-recruitment-ats/lib/visibility";

// The recruiting settings singleton: whether the area is open, and which cycle
// it is running.
//
// GET: any signed-in member reads both. The active cycle is not a secret — it is
// which cohort the console is showing — and members need it to make sense of the
// pool they are looking at.
// POST: exec-only — flips visibility, opens a new cycle, or both.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [visible, activeCycle] = await Promise.all([isRecruitingVisible(), getActiveCycle()]);
  return NextResponse.json({
    visible,
    activeCycle,
    activeCycleLabel: cycleLabel(activeCycle),
    // What "open the next cycle" would mean, so the UI can offer it as one click
    // rather than asking exec to type a key and hope they get the format right.
    nextCycle: nextRecruitingCycle(activeCycle),
    canManage: isExec(session.user.role),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isExec(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });
  }

  let body: { visible?: boolean; cycle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const wantsVisibility = body.visible !== undefined;
  const wantsCycle = body.cycle !== undefined;
  if (!wantsVisibility && !wantsCycle) {
    return NextResponse.json(
      { ok: false, error: "Pass `visible` (boolean), `cycle` (e.g. 'fa26'), or both." },
      { status: 400 }
    );
  }
  if (wantsVisibility && typeof body.visible !== "boolean") {
    return NextResponse.json({ ok: false, error: "visible must be a boolean" }, { status: 400 });
  }

  const out: { ok: true; visible?: boolean; cycle?: string; cycleLabel?: string } = { ok: true };

  // The cycle is written first. Opening a new cycle and reopening recruiting is
  // one action for exec, and if the cycle write fails, flipping recruiting open
  // would put members in front of the PREVIOUS cohort — the wrong pool, silently.
  if (wantsCycle) {
    const result = await setActiveCycle(String(body.cycle), email);
    if (result.demo) {
      return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — setting not saved." });
    }
    // A malformed cycle is the caller's mistake, not a server fault.
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.invalid ? 400 : 500 });
    }
    out.cycle = result.cycle;
    out.cycleLabel = cycleLabel(result.cycle);
  }

  if (wantsVisibility) {
    const result = await setRecruitingVisible(body.visible as boolean, email);
    if (result.demo) {
      return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — setting not saved." });
    }
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    out.visible = body.visible as boolean;
  }

  return NextResponse.json(out);
}
