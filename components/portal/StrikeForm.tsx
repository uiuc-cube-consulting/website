"use client";

import { useState } from "react";
import { MemberSearch, type MemberOption } from "@/components/portal/MemberSearch";
import { EmailEditorModal, type EmailPayload } from "@/components/portal/EmailEditorModal";
import { approvalTemplate } from "@/lib/email/strikes";
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

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleMemberSelect(member: MemberOption) {
    setSelectedMember(member);
    setMemberTotal(null);
    if (!isExec) return;
    setLoadingTotal(true);
    try {
      const res = await fetch(
        `/api/strikes?summary=true&member_id=${encodeURIComponent(member.id)}`
      );
      if (res.ok) {
        const data = await res.json();
        setMemberTotal(data.total ?? 0);
      }
    } finally {
      setLoadingTotal(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedMember || !reason.trim()) return;
    if (isExec) {
      setShowEmailModal(true);
    } else {
      doSubmit(null, null);
    }
  }

  async function doSubmit(
    primary: EmailPayload | null,
    _secondary: EmailPayload | null | undefined
  ) {
    if (!selectedMember) return;
    setSubmitting(true);
    setError(null);
    setShowEmailModal(false);

    // Build approval email for the struck member based on projected new total
    const projectedTotal = (memberTotal ?? 0) + (strikeType === "full" ? 1 : 0.5);
    const template = approvalTemplate(selectedMember.name, reason, projectedTotal);

    try {
      const res = await fetch("/api/strikes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_member_id: selectedMember.id,
          strike_type: strikeType,
          reason,
          email_subject: primary?.subject ?? template.subject,
          email_body: primary?.body ?? template.html,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to submit");
      }

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
            {isExec ? "Strike submitted" : "Request submitted"}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)] max-w-sm">
            {isExec
              ? `A ${strikeType} strike has been filed against ${selectedMember?.name} and they have been notified.`
              : `Your strike request against ${selectedMember?.name} has been submitted for exec review.`}
          </p>
        </div>
        <a href="/portal/strikes" className="btn btn-gold text-sm px-5 py-2 mt-2">
          View strikes
        </a>
      </div>
    );
  }

  const projectedTotal = (memberTotal ?? 0) + (strikeType === "full" ? 1 : 0.5);
  const memberTemplate =
    selectedMember && isExec
      ? approvalTemplate(selectedMember.name, reason || "(reason)", projectedTotal)
      : null;

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[var(--border)] bg-white p-6 md:p-8 space-y-6"
      >
        {/* Member search */}
        <div>
          <label className="block text-sm font-semibold text-[var(--bg-dark)] mb-2">
            Member
          </label>
          <MemberSearch onSelect={handleMemberSelect} disabled={submitting} />
          {isExec && selectedMember && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              {loadingTotal
                ? "Loading strike record…"
                : `Currently at ${memberTotal ?? 0} strike${memberTotal === 1 ? "" : "s"}`}
            </p>
          )}
        </div>

        {/* Strike type */}
        <div>
          <label className="block text-sm font-semibold text-[var(--bg-dark)] mb-2">
            Strike weight
          </label>
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
          <label
            htmlFor="reason"
            className="block text-sm font-semibold text-[var(--bg-dark)] mb-2"
          >
            Reason
          </label>
          <textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Describe the reason for this strike request…"
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
          {submitting
            ? "Submitting…"
            : isExec
            ? "Review email & submit"
            : "Submit request"}
        </button>
      </form>

      {showEmailModal && memberTemplate && selectedMember && (
        <EmailEditorModal
          title={`Email to ${selectedMember.name}`}
          confirmLabel="Confirm & send strike"
          initialSubject={memberTemplate.subject}
          initialBody={memberTemplate.html}
          loading={submitting}
          onCancel={() => setShowEmailModal(false)}
          onConfirm={(primary) => doSubmit(primary, null)}
        />
      )}
    </>
  );
}
