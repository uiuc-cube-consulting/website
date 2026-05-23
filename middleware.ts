// middleware.ts (at project root)
import { auth } from "@/auth";
import { NextResponse } from "next/server";

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
  matcher: ["/portal/:path*"],  // only runs on /portal/* routes
};
