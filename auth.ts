import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { createServerClient } from "@/lib/supabase/server";

declare module "next-auth" {
  interface Session {
    user: {
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      cohort: string;
    };
  }
}

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

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from("members")
        .select("id")
        .eq("email", email)
        .single();

      if (error || !data) return false;
      return true;
    },
    async jwt({ token, trigger }) {
      // Only re-fetch from DB on initial sign-in or explicit refresh
      if (trigger === "signIn" || trigger === "update") {
        const supabase = createServerClient();
        const { data } = await supabase
          .from("members")
          .select("role, cohort")
          .eq("email", token.email)
          .single();

        if (data) {
          token.role = data.role;
          token.cohort = data.cohort;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.email = session.user.email.toLowerCase();
      session.user.role = token.role as string;
      session.user.cohort = token.cohort as string;
      return session;
    },
  },
} satisfies NextAuthConfig);
