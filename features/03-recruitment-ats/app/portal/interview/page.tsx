import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { InterviewConsole } from "@/features/03-recruitment-ats/components/InterviewConsole";
import { canInterview } from "@/features/03-recruitment-ats/lib/interview";
import { canViewRecruiting } from "@/features/03-recruitment-ats/lib/visibility";

export const metadata: Metadata = {
  title: "Interviews",
  robots: { index: false, follow: false },
};

export default async function InterviewPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");
  if (!canInterview(session.user.role)) redirect("/portal");
  if (!(await canViewRecruiting(session.user.role))) redirect("/portal");

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Recruiting</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Interview console.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Search the candidate you&rsquo;re about to interview and get their resume, case rubric, and
          behavioral rubric on one screen. Your rubrics are yours — you fill in a copy for the
          people you&rsquo;re interviewing, and the templates stay untouched.
        </p>
      </div>
      <div className="mt-8">
        <InterviewConsole />
      </div>
    </div>
  );
}
