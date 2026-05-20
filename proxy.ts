// Next.js 16 renamed `middleware` to `proxy`. The exported function must be
// named `proxy` (or be the default export). NextAuth's `auth` helper is the
// request handler — re-export it under the expected name.
export { auth as proxy } from "@/auth";

export const config = {
  // Protect every route under /portal. The sign-in page is also under /portal
  // so it stays accessible — NextAuth handles the redirect for unauthenticated
  // visitors hitting protected sub-routes.
  matcher: ["/portal/:path*"],
};
