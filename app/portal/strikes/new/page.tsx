import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { StrikeForm } from "@/components/portal/StrikeForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NewStrikePage() {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/portal/sign-in");

  // Only PMs and exec can file strikes; the exec board reviews them.
  const role = session.user.role;
  if (role !== "exec" && role !== "project_manager") redirect("/portal");
  const isExec = role === "exec";

  return (
    <div className="container-x py-10 md:py-14 max-w-2xl">
      <Link
        href={isExec ? "/portal/strikes" : "/portal"}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--bg-dark)] mb-8 transition-colors"
      >
        <ChevronLeft size={16} />
        {isExec ? "Back to strikes" : "Back to portal"}
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
