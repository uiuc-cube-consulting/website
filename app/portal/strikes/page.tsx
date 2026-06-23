import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { OwnStrikeRow, FiledStrikeRow, ExecStrikeRow, StatusBadge } from "@/components/portal/StrikeCard";

export const dynamic = "force-dynamic";

export default async function StrikesPage() {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/portal/sign-in");

  const { memberId, role } = session.user;
  const supabase = createServerClient();

  const canFile = ["exec", "project_manager", "senior_consultant"].includes(role);

  // ── Exec view ────────────────────────────────────────────────────────────
  if (role === "exec") {
    const { data: allStrikes } = await supabase
      .from("strikes")
      .select(`
        id, strike_type, effective_type, reason, status, created_at,
        member:member_id ( id, full_name, email ),
        filer:filed_by ( id, full_name, email )
      `)
      .order("created_at", { ascending: false });

    const pending = (allStrikes ?? []).filter((s) => s.status === "pending");
    const rest = (allStrikes ?? []).filter((s) => s.status !== "pending");

    return (
      <div className="container-x py-10 md:py-14 space-y-12">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="eyebrow">Strike management</p>
            <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-tight">
              Strikes
            </h1>
          </div>
          <Link href="/portal/strikes/new" className="btn btn-gold text-sm px-5 py-2 flex items-center gap-2">
            <Plus size={16} />
            File a strike
          </Link>
        </div>

        {/* Pending queue */}
        <section>
          <h2 className="font-display font-bold text-xl text-[var(--bg-dark)] mb-4">
            Pending requests
            {pending.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-yellow-100 text-yellow-700 text-xs font-bold">
                {pending.length}
              </span>
            )}
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No pending requests.</p>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-cream)]/40">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Member</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Filed by</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Weight</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {pending.map((s) => (
                    <ExecStrikeRow key={s.id} strike={s as unknown as Parameters<typeof ExecStrikeRow>[0]["strike"]} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* All strikes history */}
        <section>
          <h2 className="font-display font-bold text-xl text-[var(--bg-dark)] mb-4">All strikes</h2>
          {rest.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No strike history yet.</p>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-cream)]/40">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Member</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Filed by</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Weight</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rest.map((s) => (
                    <ExecStrikeRow key={s.id} strike={s as unknown as Parameters<typeof ExecStrikeRow>[0]["strike"]} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── PM / SC view ─────────────────────────────────────────────────────────
  if (role === "project_manager" || role === "senior_consultant") {
    const { data: filed } = await supabase
      .from("strikes")
      .select(`
        id, strike_type, effective_type, reason, status, created_at,
        member:member_id ( id, full_name, email )
      `)
      .eq("filed_by", memberId)
      .order("created_at", { ascending: false });

    const { data: received } = await supabase
      .from("strikes")
      .select("id, strike_type, effective_type, reason, status, created_at")
      .eq("member_id", memberId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    return (
      <div className="container-x py-10 md:py-14 space-y-12">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="eyebrow">Strikes</p>
            <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-tight">
              Strike system
            </h1>
          </div>
          <Link href="/portal/strikes/new" className="btn btn-gold text-sm px-5 py-2 flex items-center gap-2">
            <Plus size={16} />
            File a strike
          </Link>
        </div>

        {/* My filed requests */}
        <section>
          <h2 className="font-display font-bold text-xl text-[var(--bg-dark)] mb-4">Requests I filed</h2>
          {!filed || filed.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">You have not filed any strike requests.</p>
          ) : (
            <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--bg-cream)]/40">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Member</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Original weight</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Current weight</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Date</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {filed.map((s) => (
                    <FiledStrikeRow key={s.id} strike={s as unknown as Parameters<typeof FiledStrikeRow>[0]["strike"]} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* My own strike record */}
        <OwnStrikeHistory received={received ?? []} />
      </div>
    );
  }

  // ── Regular member view ───────────────────────────────────────────────────
  const { data: received } = await supabase
    .from("strikes")
    .select("id, strike_type, effective_type, reason, status, created_at")
    .eq("member_id", memberId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Strikes</p>
        <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-tight">
          My strike record
        </h1>
        <p className="mt-3 text-[var(--muted)] max-w-xl">
          A record of strikes issued against your membership. Contact the executive board if you have questions.
        </p>
      </div>
      <div className="mt-10">
        <OwnStrikeHistory received={received ?? []} />
      </div>
    </div>
  );
}

type OwnStrike = {
  id: string;
  strike_type: "half" | "full";
  effective_type: "half" | "full" | "voided" | null;
  reason: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
};

function OwnStrikeHistory({ received }: { received: OwnStrike[] }) {
  return (
    <section>
      <h2 className="font-display font-bold text-xl text-[var(--bg-dark)] mb-4">My strike record</h2>
      {received.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border)] bg-white p-8 text-center">
          <p className="text-sm text-[var(--muted)]">No strikes on your record.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-cream)]/40">
                <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Weight</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Status</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Reason</th>
              </tr>
            </thead>
            <tbody>
              {received.map((s) => (
                <OwnStrikeRow key={s.id} strike={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
