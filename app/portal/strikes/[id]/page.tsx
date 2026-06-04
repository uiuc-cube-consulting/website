import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { computeStrikeTotal, weightLabel, strikeLabel, deriveModification } from "@/lib/strikes";
import { StatusBadge } from "@/components/portal/StrikeCard";
import { StrikeActions } from "@/components/portal/StrikeActions";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function StrikeDetailPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/portal/sign-in");
  if (session.user.role !== "exec") redirect("/portal/strikes");

  const { id } = await params;
  const supabase = createServerClient();

  const { data: strike, error } = await supabase
    .from("strikes")
    .select(`
      *,
      member:member_id ( id, full_name, email ),
      filer:filed_by ( id, full_name, email ),
      resolver:resolved_by ( id, full_name, email )
    `)
    .eq("id", id)
    .single();

  if (error || !strike) notFound();

  // Current total for the target member
  const { data: allStrikes } = await supabase
    .from("strikes")
    .select("effective_type, status")
    .eq("member_id", strike.member_id);

  const memberTotal = computeStrikeTotal(allStrikes ?? []);

  const filed = new Date(strike.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const resolved = strike.resolved_at
    ? new Date(strike.resolved_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const mod = deriveModification(strike);

  return (
    <div className="container-x py-10 md:py-14 max-w-2xl">
      <Link
        href="/portal/strikes"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--bg-dark)] mb-8 transition-colors"
      >
        <ChevronLeft size={16} />
        Back to strikes
      </Link>

      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow">Strike detail</p>
          <h1 className="mt-3 font-display font-extrabold text-3xl md:text-4xl text-[var(--bg-dark)] leading-tight">
            {strike.member?.full_name ?? "Unknown member"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{strike.member?.email}</p>
        </div>
        <StatusBadge status={strike.status} effectiveType={strike.effective_type} />
      </div>

      {/* Strike total callout */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 px-5 py-4 mb-8">
        <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1">
          Member&apos;s current strike total
        </p>
        <p className="font-display font-extrabold text-2xl text-[var(--bg-dark)]">
          {strikeLabel(memberTotal)}
        </p>
        <p className="text-xs text-[var(--muted)] mt-0.5">{memberTotal} / 3 strikes</p>
      </div>

      {/* Details grid */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 space-y-5 mb-8">
        <DetailRow label="Filed by" value={strike.filer?.full_name ?? "—"} />
        <DetailRow label="Filed on" value={filed} />
        <DetailRow label="Original weight" value={weightLabel(strike.strike_type)} />
        {mod !== "unmodified" && strike.effective_type && (
          <DetailRow
            label="Current weight"
            value={
              strike.effective_type === "voided"
                ? "Voided"
                : `${weightLabel(strike.effective_type)} (${mod})`
            }
          />
        )}
        {resolved && (
          <>
            <DetailRow label="Reviewed by" value={strike.resolver?.full_name ?? "—"} />
            <DetailRow label="Reviewed on" value={resolved} />
          </>
        )}
        {strike.resolution_note && (
          <DetailRow label="Note" value={strike.resolution_note} />
        )}
        <div className="pt-1">
          <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">Reason</p>
          <p className="text-sm text-[var(--bg-dark)] leading-relaxed">{strike.reason}</p>
        </div>
      </div>

      {/* Actions */}
      <StrikeActions
        strike={{
          ...strike,
          member: strike.member,
          filer: strike.filer,
          member_strike_total: memberTotal,
        }}
        resolverMemberId={session.user.memberId}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide shrink-0 pt-0.5">
        {label}
      </p>
      <p className="text-sm text-[var(--bg-dark)] text-right">{value}</p>
    </div>
  );
}
