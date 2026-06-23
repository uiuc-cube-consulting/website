import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";

export const metadata: Metadata = {
  title: "Member Portal",
  robots: { index: false, follow: false },
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const email = session?.user?.email;
  const name = session?.user?.name;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-cream)]/40">
      {/* Portal-specific header — replaces the public site header on /portal/* */}
      <header className="sticky top-0 z-50 bg-[var(--bg-dark)] text-[var(--fg-on-dark)]">
        <div className="container-x flex h-16 md:h-20 items-center justify-between gap-6">
          <Link href="/portal" className="flex items-center gap-3 group">
            <Image src="/cube-logo.png" alt="" width={40} height={40} className="w-9 h-9" />
            <span className="font-display font-extrabold leading-[1.02] tracking-[0.04em] text-[13px] md:text-[15px]">
              <span className="block">CUBE</span>
              <span className="block">PORTAL</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-[14px]" aria-label="Portal">
            <Link href="/portal" className="nav-link">Dashboard</Link>
            <Link href="/portal#calendar" className="nav-link">Calendar</Link>
            <Link href="/portal#points" className="nav-link">Points</Link>
            <Link href="/portal/case-studies" className="nav-link">Case Studies</Link>
            <Link href="/portal/pipeline" className="nav-link">Pipeline</Link>
            <Link href="/portal/recruiting" className="nav-link">Recruiting</Link>
            <Link href="/portal/brain" className="nav-link">CUBE Brain</Link>
            <Link href="/portal#resources" className="nav-link">Resources</Link>
            <Link href="/portal/strikes" className="nav-link">Strikes</Link>
            <Link href="/" className="nav-link">Public Site</Link>
          </nav>

          {email ? (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
              className="flex items-center gap-3"
            >
              <span className="hidden sm:inline text-xs text-white/55">
                {name || email}
              </span>
              <button type="submit" className="btn btn-gold text-xs px-4 py-2">
                Sign out
              </button>
            </form>
          ) : (
            <Link href="/portal/sign-in" className="btn btn-gold text-xs px-4 py-2">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-[var(--border)] bg-white">
        <div className="container-x py-5 text-xs text-[var(--muted)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>CUBE Consulting member portal · internal use only</span>
          <Link href="/" className="hover:text-[var(--gold-deep)]">← Back to public site</Link>
        </div>
      </footer>
    </div>
  );
}
