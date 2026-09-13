import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PointReviewQueue } from "@/components/portal/PointReviewQueue";

export const dynamic = "force-dynamic";

export default async function PointReviewPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");
  // proxy.ts already sends non-exec away. Checked again here so the page never
  // depends on the matcher alone.
  if (session.user.role !== "exec") redirect("/portal");

  return (
    <div className="container-x py-10 md:py-14">
      <Link
        href="/portal#submit-points"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--gold-deep)]"
      >
        <ArrowLeft size={14} /> Dashboard
      </Link>
      <p className="eyebrow mt-6">Points</p>
      <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-tight">
        Review submissions
      </h1>
      <p className="mt-3 text-[var(--muted)] max-w-2xl">
        Check the photo matches the event. Approving adds the points to the member&rsquo;s total on the standings
        board. Rejecting shows your note to them on their submission.
      </p>
      <div className="mt-8">
        <PointReviewQueue />
      </div>
    </div>
  );
}
