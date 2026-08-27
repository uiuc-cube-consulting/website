import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { isRecruitingVisible, setRecruitingVisible } from "@/features/03-recruitment-ats/lib/visibility";

// GET: any signed-in member checks whether recruiting is currently open.
// POST: exec-only — flips it for everyone else.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const visible = await isRecruitingVisible();
  return NextResponse.json({ visible, canManage: isExec(session.user.role) });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!isExec(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: "Exec only" }, { status: 403 });
  }

  let body: { visible?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.visible !== "boolean") {
    return NextResponse.json({ ok: false, error: "visible must be a boolean" }, { status: 400 });
  }

  const result = await setRecruitingVisible(body.visible, email);
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — setting not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  return NextResponse.json({ ok: true, visible: body.visible });
}
