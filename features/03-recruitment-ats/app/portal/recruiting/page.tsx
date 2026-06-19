import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RecruitingDashboard } from "@/features/03-recruitment-ats/components/RecruitingDashboard";

export const metadata: Metadata = {
  title: "Recruiting",
  robots: { index: false, follow: false },
};

export default async function RecruitingPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Recruiting</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Applicant review.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Score applicants on the calibrated rubric, watch the funnel, and catch where reviewers
          disagree or coverage is thin. Your scores stay yours until you submit.
        </p>
      </div>
      <div className="mt-8">
        <RecruitingDashboard />
      </div>
    </div>
  );
}
