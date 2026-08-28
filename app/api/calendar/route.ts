import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchUpcomingEvents } from "@/lib/calendar";
import { toDisplayDays, CLUB_TIME_ZONE } from "@/lib/calendar-format";

// Members-only: upcoming club events, read server-side with the service account.
//
// Any signed-in member may see the schedule — it is the same information the
// calendar itself carries, and the portal sign-in is the gate. Nothing here is
// role-specific.

export const dynamic = "force-dynamic";
// The calendar changes on human timescales; a short cache keeps a busy portal
// from making a Google request per page view.
export const revalidate = 300;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await fetchUpcomingEvents();
  if (!result.ok) {
    // 200 with an error payload, not 5xx: a missing share is a setup state, not
    // a server fault, and the UI renders it as guidance rather than a crash.
    return NextResponse.json({ ok: false, error: result.error, hint: result.hint, days: [] });
  }

  return NextResponse.json({
    ok: true,
    days: toDisplayDays(result.events, CLUB_TIME_ZONE),
    count: result.events.length,
    timeZone: CLUB_TIME_ZONE,
  });
}
