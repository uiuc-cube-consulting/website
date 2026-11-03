import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RecruitingTabs } from "@/features/03-recruitment-ats/components/RecruitingTabs";
import { isExec } from "@/features/03-recruitment-ats/lib/access";
import { canInterview } from "@/features/03-recruitment-ats/lib/interview";
import { parseRecruitingTab } from "@/features/03-recruitment-ats/lib/recruiting-tabs";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";

export const metadata: Metadata = {
  title: "Recruiting",
  robots: { index: false, follow: false },
};

export default async function RecruitingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");
  if (!(await canViewRecruiting(session.user.role))) redirect("/portal");

  const { tab } = await searchParams;
  const initialTab = parseRecruitingTab(tab);

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Recruiting · Rounds 1 to 3</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Recruiting.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Every round in one place: score written applications, then run the interviews. Pick a
          tab below.
        </p>
      </div>
      {/* Exec get extra tabs — the final-decision queue (where both reviewers'
          verdicts are unblinded), demographics, and visibility. Everyone else
          sees only the review dashboard and the interview console, so the screen
          stays blind. The exec check is repeated in the API — this only decides
          what is rendered. */}
      <div className="mt-8">
        <RecruitingTabs
          isExec={isExec(session.user.role)}
          canInterview={canInterview(session.user.role)}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}
