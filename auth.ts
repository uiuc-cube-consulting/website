import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Member portal authentication.
 *
 * Members sign in with Google; access is gated by a comma-separated
 * allowlist in the PORTAL_ALLOWLIST env var. The allowlist is the
 * authoritative roster — anyone not on it is bounced back to sign-in
 * with an "access denied" message even after a successful Google login.
 *
 * Env vars required:
 *   AUTH_SECRET           — `openssl rand -base64 32`
 *   AUTH_GOOGLE_ID        — OAuth client id (Google Cloud Console)
 *   AUTH_GOOGLE_SECRET    — OAuth client secret
 *   PORTAL_ALLOWLIST      — comma-separated emails (lowercase)
 */

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export const PORTAL_ALLOWLIST = parseAllowlist(process.env.PORTAL_ALLOWLIST);

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [Google],
  pages: {
    signIn: "/portal/sign-in",
    error: "/portal/sign-in",
  },
  callbacks: {
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase();
      if (!email) return false;
      // If the allowlist is empty, allow any signed-in Google user. This
      // is a development convenience — set PORTAL_ALLOWLIST in prod.
      if (PORTAL_ALLOWLIST.size === 0) return true;
      return PORTAL_ALLOWLIST.has(email);
    },
    async session({ session }) {
      if (session.user?.email) {
        session.user.email = session.user.email.toLowerCase();
      }
      return session;
    },
  },
});
