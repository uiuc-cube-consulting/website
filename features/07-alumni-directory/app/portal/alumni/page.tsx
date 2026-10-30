import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AlumniDirectory } from "@/features/07-alumni-directory/components/AlumniDirectory";
import { currentMember } from "@/features/08-member-matching/lib/store";
import { loadNetwork } from "@/features/09-cube-network/lib/store";

export const metadata: Metadata = {
  title: "CUBE Network",
  // Members-only: names, personal emails and phone numbers.
  robots: { index: false, follow: false },
};

export default async function AlumniPage() {
  // Defense-in-depth: proxy.ts already gates /portal/*, but every portal page
  // re-checks the session.
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");
  let result: Awaited<ReturnType<typeof loadNetwork>> | null = null;
  let isExec = false;
  let viewer: Awaited<ReturnType<typeof currentMember>> = null;
  let rosterChecked = false;
  try {
    viewer = session.user.memberId ? await currentMember(session.user.memberId) : null;
    rosterChecked = true;
  } catch {
    // Configuration/migration failure is not an empty, apparently complete roster.
  }
  if (rosterChecked && !viewer) redirect("/portal/sign-in");
  if (viewer) {
    isExec = viewer.role === "exec";
    try { result = await loadNetwork(isExec); } catch { /* visible unavailable state */ }
  }

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Network</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Your CUBE network.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Current members, exec and alumni, together. Find people who share your interests,
          mentors open to a conversation, and alumni in fields you want to explore.
        </p>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-4 text-sm text-[var(--bg-dark)]">
        <span aria-hidden className="mt-0.5 text-[var(--gold-deep)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <p>
          <span className="font-semibold">For CUBE members only.</span> People shared their contact
          details with CUBE, not with the public. Don&rsquo;t pass them on, and say you&rsquo;re in
          CUBE when you reach out.
        </p>
      </div>
      <p className="mt-4 text-sm text-[var(--muted)]">Keep your own details current in <a className="font-semibold text-[var(--brand)] underline" href="/portal/profile">My Profile</a>. Shared interests and contact details are opt-in. “Source check needed” is not a claim that someone did not attend UIUC.</p>

      <div className="mt-8">
        {result ? (
          <>{result.warnings.map((warning) => <p role="status" key={warning} className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-cream)] p-4 text-sm">{warning}</p>)}<AlumniDirectory initialAlumni={result.rows} isExec={isExec} /></>
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
            <p className="font-display text-xl font-bold text-[var(--bg-dark)]">
              Couldn&rsquo;t load the CUBE network
            </p>
            <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
              Try again in a minute. Exec should check Supabase configuration and the alumni, profile and network migrations.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
