import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { StrikeForm } from "@/components/portal/StrikeForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["exec", "project_manager", "senior_consultant"];

export default async function NewStrikePage() {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/portal/sign-in");

  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/portal/strikes");
  }

  const isExec = session.user.role === "exec";

  return (
    <div className="container-x py-10 md:py-14 max-w-2xl">
      <Link
        href="/portal/strikes"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--bg-dark)] mb-8 transition-colors"
      >
        <ChevronLeft size={16} />
        Back to strikes
      </Link>

      <div className="mb-8">
        <p className="eyebrow">{isExec ? "File a strike" : "Request a strike"}</p>
        <h1 className="mt-3 font-display font-extrabold text-4xl text-[var(--bg-dark)] leading-tight">
          {isExec ? "File a strike" : "Submit a strike request"}
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          {isExec
            ? "Strike will be approved immediately and the member will be notified by email."
            : "Your request will be reviewed by the executive board before taking effect."}
        </p>
      </div>

      <StrikeForm isExec={isExec} sessionMemberId={session.user.memberId} />
    </div>
  );
}
