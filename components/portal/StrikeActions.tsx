"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Strike = {
  id: string;
  status: "pending" | "approved" | "denied";
  strike_type: "half" | "full";
  effective_type: "half" | "full" | "voided" | null;
  reason: string;
  filed_by: string;
  member: { id: string; full_name: string; email: string };
  filer: { id: string; full_name: string; email: string };
  member_strike_total: number;
};

type Action = "approve" | "deny" | "void" | "downgrade" | "upgrade";

type Props = {
  strike: Strike;
  resolverMemberId: string;
};

// Notification emails are generated + sent server-side; exec just confirms the action.
const CONFIRM: Record<Action, string> = {
  approve: "Approve this strike? The member will be notified by email.",
  deny: "Deny this strike request?",
  void: "Void this strike? It will no longer count toward the member's total.",
  downgrade: "Downgrade this full strike to a half strike?",
  upgrade: "Upgrade this half strike to a full strike?",
};

export function StrikeActions({ strike }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(action: Action) {
    if (typeof window !== "undefined" && !window.confirm(CONFIRM[action])) return;
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/strikes/${strike.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed to update strike (${res.status})`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(null);
    }
  }

  const isPending = strike.status === "pending";
  const isApproved = strike.status === "approved" && strike.effective_type !== "voided";
  const busy = loading !== null;
  const btn = "btn btn-dark text-sm px-5 py-2 opacity-70 hover:opacity-100 disabled:opacity-40";

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {isPending && (
          <>
            <button onClick={() => resolve("approve")} disabled={busy} className="btn btn-gold text-sm px-5 py-2 disabled:opacity-50">
              {loading === "approve" ? "Approving…" : "Approve"}
            </button>
            <button onClick={() => resolve("deny")} disabled={busy} className={btn}>
              {loading === "deny" ? "Denying…" : "Deny"}
            </button>
          </>
        )}

        {isApproved && (
          <>
            <button onClick={() => resolve("void")} disabled={busy} className={btn}>
              {loading === "void" ? "Voiding…" : "Void strike"}
            </button>
            {strike.effective_type === "full" && (
              <button onClick={() => resolve("downgrade")} disabled={busy} className={btn}>
                {loading === "downgrade" ? "Downgrading…" : "Downgrade to half"}
              </button>
            )}
            {strike.effective_type === "half" && (
              <button onClick={() => resolve("upgrade")} disabled={busy} className={btn}>
                {loading === "upgrade" ? "Upgrading…" : "Upgrade to full"}
              </button>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
