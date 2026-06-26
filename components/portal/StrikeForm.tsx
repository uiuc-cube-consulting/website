"use client";

import { useState } from "react";
import { MemberSearch, type MemberOption } from "@/components/portal/MemberSearch";
import { weightLabel } from "@/lib/strikes";
import { CheckCircle } from "lucide-react";

type Props = {
  isExec: boolean;
  sessionMemberId: string;
};

export function StrikeForm({ isExec }: Props) {
  const [selectedMember, setSelectedMember] = useState<MemberOption | null>(null);
  const [strikeType, setStrikeType] = useState<"half" | "full">("full");
  const [reason, setReason] = useState("");
  const [memberTotal, setMemberTotal] = useState<number | null>(null);
  const [loadingTotal, setLoadingTotal] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMemberSelect(member: MemberOption) {
    setSelectedMember(member);
    setMemberTotal(null);
    if (!isExec) return;
    setLoadingTotal(true);
    try {
      const res = await fetch(`/api/strikes?summary=true&member_id=${encodeURIComponent(member.id)}`);
      if (res.ok) {
        const data = await res.json();
        setMemberTotal(data.total ?? 0);
      }
    } finally {
      setLoadingTotal(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMember || !reason.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/strikes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_member_id: selectedMember.id,
          strike_type: strikeType,
          reason,
        }),
      });
      // Parse defensively — never assume the body is JSON.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Failed to submit (${res.status})`);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 flex flex-col items-center text-center gap-4">
        <span className="grid place-items-center w-14 h-14 rounded-full bg-green-50 text-green-600">
          <CheckCircle size={28} />
        </span>
        <div>
          <h2 className="font-display font-bold text-xl text-[var(--bg-dark)]">
            {isExec ? "Strike filed" : "Request submitted"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)] max-w-sm">
            {isExec
              ? `A ${strikeType} strike has been filed against ${selectedMember?.name}, and they'll be notified by email.`
              : `Your strike request against ${selectedMember?.name} has been submitted for exec review.`}
          </p>
        </div>
        <a href={isExec ? "/portal/strikes" : "/portal"} className="btn btn-gold text-sm px-5 py-2 mt-2">
          {isExec ? "View strikes" : "Back to portal"}
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[var(--border)] bg-white p-6 md:p-8 space-y-6"
    >
      {/* Member search */}
      <div>
        <label className="block text-sm font-semibold text-[var(--bg-dark)] mb-2">Member</label>
        <MemberSearch onSelect={handleMemberSelect} disabled={submitting} />
        {isExec && selectedMember && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            {loadingTotal ? "Loading strike record…" : `Currently at ${memberTotal ?? 0} strike${memberTotal === 1 ? "" : "s"}`}
          </p>
        )}
      </div>

      {/* Strike type */}
      <div>
        <label className="block text-sm font-semibold text-[var(--bg-dark)] mb-2">Strike weight</label>
        <div className="flex gap-3">
          {(["half", "full"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setStrikeType(t)}
              className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${
                strikeType === t
                  ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold-deep)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--gold)]/50"
              }`}
            >
              {weightLabel(t)}
            </button>
          ))}
        </div>
      </div>

      {/* Reason */}
      <div>
        <label htmlFor="reason" className="block text-sm font-semibold text-[var(--bg-dark)] mb-2">
          Reason
        </label>
        <textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          placeholder="Describe the reason for this strike…"
          disabled={submitting}
          required
          className="w-full px-4 py-3 rounded-xl border border-[var(--border)] text-sm focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2 resize-y disabled:opacity-50"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !selectedMember || !reason.trim()}
        className="btn btn-gold w-full py-3 disabled:opacity-50"
      >
        {submitting ? "Submitting…" : isExec ? "File strike" : "Submit request"}
      </button>
    </form>
  );
}
