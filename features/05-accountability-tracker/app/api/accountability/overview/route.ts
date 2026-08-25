import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOverview } from "@/features/05-accountability-tracker/lib/store";
import { isExec } from "@/features/05-accountability-tracker/lib/access";

export const dynamic = "force-dynamic";

/**
 * GET /api/accountability/overview — every active project's completion and its
 * Below ratings. Exec only: this is the one view that reads across projects.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isExec({ memberId: session.user.memberId, role: session.user.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { summaries, demo } = await getOverview();
  return NextResponse.json({ summaries, demo });
}
