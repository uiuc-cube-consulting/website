"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailEditorModal, type EmailPayload } from "@/components/portal/EmailEditorModal";
import {
  approvalTemplate,
  requesterApprovalTemplate,
  requesterDenialTemplate,
  voidTemplate,
  requesterVoidTemplate,
  downgradeTemplate,
  requesterDowngradeTemplate,
  upgradeTemplate,
  requesterUpgradeTemplate,
} from "@/lib/email/strikes";
import { weightLabel, strikeLabel } from "@/lib/strikes";

type Strike = {
  id: string;
  status: "pending" | "approved" | "denied";
  strike_type: "half" | "full";
  effective_type: "half" | "full" | "voided" | null;
  reason: string;
  filed_by: string;
  member: { id: string; name: string; email: string };
  filer: { id: string; name: string; email: string };
  member_strike_total: number;
};

type Action = "approve" | "deny" | "void" | "downgrade" | "upgrade";

type ModalState = {
  action: Action;
  primarySubject: string;
  primaryBody: string;
  secondEmail?: {
    label: string;
    initialSubject: string;
    initialBody: string;
  };
};

type Props = {
  strike: Strike;
  resolverMemberId: string;
};

export function StrikeActions({ strike, resolverMemberId }: Props) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const samePersonAsResolver = strike.filed_by === resolverMemberId;
  const memberName = strike.member.name;
  const filerName = strike.filer.name;

  // Calculate projected totals for email templates
  const currentTotal = strike.member_strike_total;
  const currentEffective = strike.effective_type;
  const originalType = strike.strike_type;

  function projectedTotal(action: Action): number {
    if (action === "approve") {
      return currentTotal + (originalType === "full" ? 1 : 0.5);
    }
    if (action === "void") {
      const lost = currentEffective === "full" ? 1 : 0.5;
      return Math.max(0, currentTotal - lost);
    }
    if (action === "downgrade") return Math.max(0, currentTotal - 0.5);
    if (action === "upgrade") return currentTotal + 0.5;
    return currentTotal;
  }

  function openModal(action: Action) {
    let primarySubject = "";
    let primaryBody = "";
    let secondEmail: ModalState["secondEmail"] = undefined;

    if (action === "approve") {
      const newTotal = projectedTotal("approve");
      const primary = approvalTemplate(memberName, strike.reason, newTotal);
      primarySubject = primary.subject;
      primaryBody = primary.html;

      const requester = requesterApprovalTemplate(filerName, memberName, weightLabel(originalType));
      secondEmail = {
        label: "Requester Email",
        initialSubject: requester.subject,
        initialBody: requester.html,
      };
    } else if (action === "deny") {
      const requester = requesterDenialTemplate(filerName, memberName, weightLabel(originalType));
      primarySubject = requester.subject;
      primaryBody = requester.html;
    } else if (action === "void") {
      const newTotal = projectedTotal("void");
      const primary = voidTemplate(memberName, newTotal);
      primarySubject = primary.subject;
      primaryBody = primary.html;

      if (!samePersonAsResolver) {
        const requester = requesterVoidTemplate(filerName, memberName);
        secondEmail = {
          label: "Requester Email",
          initialSubject: requester.subject,
          initialBody: requester.html,
        };
      }
    } else if (action === "downgrade") {
      const newTotal = projectedTotal("downgrade");
      const primary = downgradeTemplate(memberName, newTotal);
      primarySubject = primary.subject;
      primaryBody = primary.html;

      if (!samePersonAsResolver) {
        const requester = requesterDowngradeTemplate(filerName, memberName);
        secondEmail = {
          label: "Requester Email",
          initialSubject: requester.subject,
          initialBody: requester.html,
        };
      }
    } else if (action === "upgrade") {
      const newTotal = projectedTotal("upgrade");
      const primary = upgradeTemplate(memberName, newTotal);
      primarySubject = primary.subject;
      primaryBody = primary.html;

      if (!samePersonAsResolver) {
        const requester = requesterUpgradeTemplate(filerName, memberName);
        secondEmail = {
          label: "Requester Email",
          initialSubject: requester.subject,
          initialBody: requester.html,
        };
      }
    }

    setModal({ action, primarySubject, primaryBody, secondEmail });
    setError(null);
  }

  async function handleConfirm(primary: EmailPayload, secondary?: EmailPayload) {
    if (!modal) return;
    setLoading(true);
    setError(null);

    const body: Record<string, string> = {
      action: modal.action,
    };

    if (modal.action === "deny") {
      body.requester_email_subject = primary.subject;
      body.requester_email_body = primary.body;
    } else {
      body.email_subject = primary.subject;
      body.email_body = primary.body;
      if (secondary) {
        body.requester_email_subject = secondary.subject;
        body.requester_email_body = secondary.body;
      }
    }

    try {
      const res = await fetch(`/api/strikes/${strike.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update strike");
      }

      setModal(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const isPending = strike.status === "pending";
  const isApproved = strike.status === "approved" && strike.effective_type !== "voided";

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {isPending && (
          <>
            <button
              onClick={() => openModal("approve")}
              className="btn btn-gold text-sm px-5 py-2"
            >
              Approve
            </button>
            <button
              onClick={() => openModal("deny")}
              className="btn btn-dark text-sm px-5 py-2 opacity-70 hover:opacity-100"
            >
              Deny
            </button>
          </>
        )}

        {isApproved && (
          <>
            <button
              onClick={() => openModal("void")}
              className="btn btn-dark text-sm px-5 py-2 opacity-70 hover:opacity-100"
            >
              Void strike
            </button>
            {strike.effective_type === "full" && (
              <button
                onClick={() => openModal("downgrade")}
                className="btn btn-dark text-sm px-5 py-2 opacity-70 hover:opacity-100"
              >
                Downgrade to half
              </button>
            )}
            {strike.effective_type === "half" && (
              <button
                onClick={() => openModal("upgrade")}
                className="btn btn-dark text-sm px-5 py-2 opacity-70 hover:opacity-100"
              >
                Upgrade to full
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

      {modal && (
        <EmailEditorModal
          title={
            modal.action === "approve"
              ? `Approve strike — ${memberName}`
              : modal.action === "deny"
              ? `Deny request — ${memberName}`
              : modal.action === "void"
              ? `Void strike — ${memberName}`
              : modal.action === "downgrade"
              ? `Downgrade to half — ${memberName}`
              : `Upgrade to full — ${memberName}`
          }
          confirmLabel={
            modal.action === "approve"
              ? "Confirm & approve"
              : modal.action === "deny"
              ? "Confirm & deny"
              : modal.action === "void"
              ? "Confirm & void"
              : modal.action === "downgrade"
              ? "Confirm & downgrade"
              : "Confirm & upgrade"
          }
          initialSubject={modal.primarySubject}
          initialBody={modal.primaryBody}
          secondEmail={modal.secondEmail}
          loading={loading}
          onCancel={() => setModal(null)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
