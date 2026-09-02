// Next.js 16 renamed `middleware` to `proxy`. The exported function must be
// named `proxy` (or be the default export). NextAuth's `auth` helper is the
// request handler — re-export it under the expected name.
import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { PIPELINE_ENABLED } from "@/features/02-pipeline-crm/lib/enabled";
import { canInterviewRole } from "@/features/03-recruitment-ats/lib/access";
// export { auth as proxy } from "@/types/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Not signed in → send to sign-in
  if (!session?.user) {
    return NextResponse.redirect(new URL("/portal/sign-in", req.url));
  }

  // Strike REVIEW dashboard (/portal/strikes, /portal/strikes/[id]) is exec-only.
  const strikeReview = pathname.startsWith("/portal/strikes") && pathname !== "/portal/strikes/new";
  if ((pathname.startsWith("/portal/admin") || strikeReview) && session.user.role !== "exec") {
    return NextResponse.redirect(new URL("/portal", req.url));
  }
  // Filing a strike (/portal/strikes/new) is limited to PMs + exec.
  if (pathname === "/portal/strikes/new" && !["exec", "project_manager"].includes(session.user.role)) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  // Accountability tracker: exec (all projects) + anyone holding a PM/SC SEAT on
  // one (their own). Returning members are included because seats drift from
  // titles — some hold an SC seat without the SC role — and the seat, not the
  // role, is what actually authorizes every read and write (lib/access.ts,
  // re-checked in the page and in every route). Someone here without a seat
  // gets an empty chooser, never anyone's ratings.
  const accountabilityRoles = ["exec", "project_manager", "senior_consultant", "returning_member"];
  if (pathname.startsWith("/portal/accountability") && !accountabilityRoles.includes(session.user.role)) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  // Pipeline CRM is switched off (features/02-pipeline-crm/lib/enabled.ts). The
  // code and its API routes remain; only the portal entry point is closed, so a
  // stale bookmark lands on the dashboard rather than a 404.
  if (!PIPELINE_ENABLED && pathname.startsWith("/portal/pipeline")) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  // Recruiting applications: every member role may view the pool, look
  // applicants up, and flag them. Scoring, screener assignment, and decisions
  // are gated further inside the API routes (lib/access.ts), not here.
  // No role check on /portal/recruiting itself — any signed-in member passes.

  // Interview console: every member role, same as scoring itself. An interview is
  // staffed from whoever is in the room, so the console cannot be narrower than
  // the write it exists to perform. The final round is still exec-only, enforced
  // per-round inside the routes (lib/rounds.ts) rather than by path here.
  if (pathname.startsWith("/portal/interview") && !canInterviewRole(session.user.role)) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/portal((?!/sign-in).*)"],
};

// export const config = {
//   // Protect every route under /portal. The sign-in page is also under /portal
//   // so it stays accessible — NextAuth handles the redirect for unauthenticated
//   // visitors hitting protected sub-routes.
//   matcher: ["/portal/:path*"],
// };
