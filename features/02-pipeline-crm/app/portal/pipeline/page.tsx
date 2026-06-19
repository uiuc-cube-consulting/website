import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PipelineBoard } from "@/features/02-pipeline-crm/components/PipelineBoard";

export const metadata: Metadata = {
  title: "Pipeline",
  robots: { index: false, follow: false },
};

export default async function PipelinePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");

  // The leadership allowlist (PIPELINE_ALLOWLIST) is enforced by /api/pipeline;
  // the board renders a "leadership only" state if the API returns 403.
  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Acquisition</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Pipeline.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          One view of every prospect, from cold lead to testimonial — over the same Sheet the
          outreach bot writes to. Track conversion, reply rate, and time-to-LOI, and see where
          the hot leads are sitting.
        </p>
      </div>

      <div className="mt-8">
        <PipelineBoard />
      </div>
    </div>
  );
}
