import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { auth, signOut } from "@/auth";
import { PIPELINE_ENABLED } from "@/features/02-pipeline-crm/lib/enabled";
import { canInterviewRole } from "@/features/03-recruitment-ats/lib/access";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";
import { PortalMobileNav, type PortalNavLink } from "@/components/PortalMobileNav";

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

  // Role-aware nav: regular members see a focused set; leadership tools are grouped
  // and only shown to the roles that can use them. Role comes from the members table
  // (auth.ts → session.user.role).
  const role = session?.user?.role;
  const isExec = role === "exec";
  const isLeadership = isExec || role === "project_manager" || role === "senior_consultant";
  // Interviewing is open to every member — matches canInterviewRole() in the ATS.
  const isInterviewer = canInterviewRole(role);
  // Recruiting visibility is a cycle-to-cycle exec toggle (lib/visibility.ts),
  // not a role — every member can see applications while it's open, and the
  // nav link (and the page itself) disappears for everyone but exec once closed.
  const recruitingOpen = await canViewRecruiting(role);

  // ONE list, rendered twice — the desktop <nav> below and the mobile panel.
  //
  // Built as data rather than as two sets of JSX because the two drift
  // otherwise: "Flags" was added to the desktop nav and, had a mobile menu
  // existed then, would have been missing from it. A link added here now
  // appears in both by construction.
  //
  // `false &&` entries are filtered out, so each line reads as "who gets this".
  const navLinks: PortalNavLink[] = [
    // Core — everyone. Calendar / Points / Resources live as sections on the Dashboard.
    { href: "/portal", label: "Dashboard" },
    { href: "/portal/case-studies", label: "Case Studies" },
    { href: "/portal/brain", label: "CUBE Brain" },
    // PMs file strikes; exec see the review dashboard (below).
    ...(role === "project_manager" ? [{ href: "/portal/strikes/new", label: "File a Strike" }] : []),
    // Leadership tools — only the roles that can use them.
    ...(isExec && PIPELINE_ENABLED ? [{ href: "/portal/pipeline", label: "Pipeline" }] : []),
    ...(isExec ? [{ href: "/portal/strikes", label: "Strikes" }] : []),
    // Accountability follows the project SEAT, not the title — returning members
    // can hold an SC seat, so they get the link too and the page decides.
    ...(isInterviewer ? [{ href: "/portal/accountability", label: "Accountability" }] : []),
    ...(recruitingOpen ? [{ href: "/portal/recruiting", label: "Recruiting" }] : []),
    // Flags are NOT behind `recruitingOpen`: they are filed at info nights and
    // coffee chats months before a cycle opens, which is exactly when the
    // recruiting console is shut. See app/portal/flags/page.tsx.
    { href: "/portal/flags", label: "Flags" },
    ...(isInterviewer && recruitingOpen ? [{ href: "/portal/interview", label: "Interviews" }] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-cream)]/40">
      {/* Portal-specific header — replaces the public site header on /portal/* */}
      {/* `relative` is what the mobile menu panel positions against — it drops
          out of flow as `absolute inset-x-0 top-full` so opening it can never
          change the header's height. */}
      <header className="relative sticky top-0 z-50 bg-[var(--bg-dark)] text-[var(--fg-on-dark)]">
        <div className="container-x flex h-16 md:h-20 items-center justify-between gap-6">
          <Link href="/portal" className="flex items-center gap-3 group">
            <Image src="/cube-logo.png" alt="" width={40} height={40} className="w-9 h-9" />
            <span className="font-display font-extrabold leading-[1.02] tracking-[0.04em] text-[13px] md:text-[15px]">
              <span className="block">CUBE</span>
              <span className="block">PORTAL</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-[14px]" aria-label="Portal">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href} className="nav-link">
                {link.label}
              </Link>
            ))}
            <span aria-hidden className="h-4 w-px bg-white/20" />
            <Link href="/" className="nav-link">Public Site</Link>
          </nav>

          <div className="flex items-center gap-2">
            {/* Mobile only. "Public Site" is appended here rather than living in
                `navLinks`, because the desktop nav renders it after a divider as
                a leave-the-portal action rather than as another portal page. */}
            <PortalMobileNav links={[...navLinks, { href: "/", label: "Public Site" }]} />

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
