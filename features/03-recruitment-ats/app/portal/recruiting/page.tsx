import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RecruitingDashboard } from "@/features/03-recruitment-ats/components/RecruitingDashboard";
import { RecruitingTabs } from "@/features/03-recruitment-ats/components/RecruitingTabs";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";

export const metadata: Metadata = {
  title: "Written applications",
  robots: { index: false, follow: false },
};

export default async function RecruitingPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");
  if (!(await canViewRecruiting(session.user.role))) redirect("/portal");

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Recruiting · Round 1 of 3</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Written applications.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Everything the form asked for, plus the resume, scored out of 28 points: three essays,
          the case essay, a miscellaneous mark, and the resume itself. Two independent readers per
          application, and your scores stay yours until you submit.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
          Interviews happen in the{" "}
          <a href="/portal/interview" className="font-semibold text-[var(--gold-deep)] hover:underline">
            interview console
          </a>
          .
        </p>
      </div>
      {/* Exec gets a second surface: the final-decision queue, where both
          reviewers' verdicts are unblinded. Everyone else sees only the review
          dashboard, so the screen stays blind. The exec check is repeated in the
          API — this only decides what is rendered. */}
      <div className="mt-8">
        {isExec(session.user.role) ? <RecruitingTabs /> : <RecruitingDashboard />}
      </div>
    </div>
  );
}
