import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { CaseStudyLibrary } from "@/features/01-case-study-engine/components/CaseStudyLibrary";
import { getCaseStudies, getFacets } from "@/features/01-case-study-engine/lib/case-studies";

export const metadata: Metadata = {
  title: "Case Studies",
  // Members-only knowledge base — keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default async function CaseStudiesPage() {
  // Defense-in-depth: proxy.ts already gates /portal/*, but every portal page
  // re-checks the session (matches the dashboard + points patterns).
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");

  const studies = getCaseStudies();
  const facets = getFacets(studies);

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Knowledge base</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Past work, searchable.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Every CUBE engagement on record. Search by topic, keyword, or client and filter by
          practice area to find a relevant example to learn from or build on.
        </p>
      </div>

      {/* Confidentiality reminder — the reason this library is members-only. */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-4 text-sm text-[var(--bg-dark)]">
        <span aria-hidden className="mt-0.5 text-[var(--gold-deep)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
        <p>
          <span className="font-semibold">Internal &amp; confidential.</span> Some engagements are
          under NDA. This library is for CUBE members only — don&rsquo;t share client names or
          deliverables outside the org.
        </p>
      </div>

      <div className="mt-8">
        <CaseStudyLibrary studies={studies} facets={facets} />
      </div>
    </div>
  );
}
