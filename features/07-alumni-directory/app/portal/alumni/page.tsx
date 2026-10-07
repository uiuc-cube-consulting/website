import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AlumniDirectory } from "@/features/07-alumni-directory/components/AlumniDirectory";
import { listAlumni } from "@/features/07-alumni-directory/lib/store";

export const metadata: Metadata = {
  title: "Alumni",
  // Members-only: names, personal emails and phone numbers.
  robots: { index: false, follow: false },
};

export default async function AlumniPage() {
  // Defense-in-depth: proxy.ts already gates /portal/*, but every portal page
  // re-checks the session.
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");
  const isExec = session.user.role === "exec";

  const result = await listAlumni();

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Network</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          CUBE alumni, searchable.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Everyone who came through CUBE that we know of. Find alumni still on campus to grab
          coffee with, or alumni at the companies and in the roles you&rsquo;re recruiting for.
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
          <span className="font-semibold">For CUBE members only.</span> Alumni shared their contact
          details with CUBE, not with the public. Don&rsquo;t pass them on, and say you&rsquo;re in
          CUBE when you reach out.
        </p>
      </div>

      <div className="mt-8">
        {result.ok ? (
          <AlumniDirectory initialAlumni={result.rows} isExec={isExec} />
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
            <p className="font-display text-xl font-bold text-[var(--bg-dark)]">
              {result.missing ? "The alumni directory isn't set up yet" : "Couldn't load the alumni directory"}
            </p>
            <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
              {result.missing
                ? isExec
                  ? "Run features/07-alumni-directory/db/schema.sql in the Supabase SQL editor, then load the alumni with the import script."
                  : "Exec are getting it ready. Check back soon."
                : "Try again in a minute. If it keeps happening, send feedback with the button below."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
