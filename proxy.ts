// Next.js 16 renamed `middleware` to `proxy`. The exported function must be
// named `proxy` (or be the default export). NextAuth's `auth` helper is the
// request handler — re-export it under the expected name.
import { auth } from "@/auth";
import { NextResponse } from "next/server";
// export { auth as proxy } from "@/types/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Not signed in → send to sign-in
  if (!session?.user) {
    return NextResponse.redirect(new URL("/portal/sign-in", req.url));
  }

  // Exec-only routes
  if (pathname.startsWith("/portal/admin") && session.user.role !== "exec") {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  // Recruitment: exec, PM, SC, returning members only
  const recruitmentRoles = ["exec", "project_manager", "senior_consultant", "returning_member"];
  if (pathname.startsWith("/portal/recruitment") && !recruitmentRoles.includes(session.user.role)) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }
});

export const config = {
  matcher: ["/portal/((?!sign-in).*)"],
};

// export const config = {
//   // Protect every route under /portal. The sign-in page is also under /portal
//   // so it stays accessible — NextAuth handles the redirect for unauthenticated
//   // visitors hitting protected sub-routes.
//   matcher: ["/portal/:path*"],
// };
