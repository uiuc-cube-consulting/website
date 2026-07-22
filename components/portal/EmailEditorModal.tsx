"use client";

import { useEffect, useState } from "react";
import { X, Pencil, Eye } from "lucide-react";
import { RichTextEditor } from "@/components/portal/RichTextEditor";
import { wrapInShell } from "@/lib/email/strikes";

export type EmailPayload = { subject: string; body: string };

type Props = {
  initialSubject: string;
  initialBody: string;
  title: string;
  confirmLabel: string;
  onConfirm: (primary: EmailPayload, secondary?: EmailPayload) => void;
  onCancel: () => void;
  loading?: boolean;
  secondEmail?: {
    label: string;
    initialSubject: string;
    initialBody: string;
  };
};

type ViewMode = "edit" | "preview";

export function EmailEditorModal({
  initialSubject,
  initialBody,
  title,
  confirmLabel,
  onConfirm,
  onCancel,
  loading,
  secondEmail,
}: Props) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [secondSubject, setSecondSubject] = useState(secondEmail?.initialSubject ?? "");
  const [secondBody, setSecondBody] = useState(secondEmail?.initialBody ?? "");

  const [activeTab, setActiveTab] = useState<"primary" | "secondary">("primary");
  const [primaryView, setPrimaryView] = useState<ViewMode>("edit");
  const [secondaryView, setSecondaryView] = useState<ViewMode>("edit");

  useEffect(() => {
    setSubject(initialSubject);
    setBody(initialBody);
    setPrimaryView("edit");
  }, [initialSubject, initialBody]);

  useEffect(() => {
    if (secondEmail) {
      setSecondSubject(secondEmail.initialSubject);
      setSecondBody(secondEmail.initialBody);
      setSecondaryView("edit");
    }
  }, [secondEmail?.initialSubject, secondEmail?.initialBody]);

  function handleConfirm() {
    const primary: EmailPayload = { subject, body };
    const secondary = secondEmail ? { subject: secondSubject, body: secondBody } : undefined;
    onConfirm(primary, secondary);
  }

  const isPrimaryActive = !secondEmail || activeTab === "primary";
  const currentView = isPrimaryActive ? primaryView : secondaryView;
  const setCurrentView = isPrimaryActive ? setPrimaryView : setSecondaryView;

  const previewHtml = isPrimaryActive
    ? wrapInShell(subject, body)
    : wrapInShell(secondSubject, secondBody);

  const canConfirm = subject.trim() && body.trim() &&
    (!secondEmail || (secondSubject.trim() && secondBody.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl border border-[var(--border)] shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] shrink-0">
          <h2 className="font-display font-bold text-[var(--bg-dark)] text-lg">{title}</h2>
          <button
            onClick={onCancel}
            className="text-[var(--muted)] hover:text-[var(--bg-dark)] transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Email tabs (only when there's a second email) */}
        {secondEmail && (
          <div className="flex border-b border-[var(--border)] shrink-0">
            <button
              onClick={() => setActiveTab("primary")}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "primary"
                  ? "border-b-2 border-[var(--gold)] text-[var(--bg-dark)]"
                  : "text-[var(--muted)] hover:text-[var(--bg-dark)]"
              }`}
            >
              Member Email
            </button>
            <button
              onClick={() => setActiveTab("secondary")}
              className={`px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === "secondary"
                  ? "border-b-2 border-[var(--gold)] text-[var(--bg-dark)]"
                  : "text-[var(--muted)] hover:text-[var(--bg-dark)]"
              }`}
            >
              {secondEmail.label}
            </button>
          </div>
        )}

        {/* Edit / Preview toggle */}
        <div className="flex items-center justify-end gap-1 px-6 pt-4 shrink-0">
          <button
            type="button"
            onClick={() => setCurrentView("edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentView === "edit"
                ? "bg-[var(--bg-dark)] text-[var(--fg-on-dark)]"
                : "text-[var(--muted)] hover:bg-gray-100"
            }`}
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            type="button"
            onClick={() => setCurrentView("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              currentView === "preview"
                ? "bg-[var(--bg-dark)] text-[var(--fg-on-dark)]"
                : "text-[var(--muted)] hover:bg-gray-100"
            }`}
          >
            <Eye size={12} />
            Preview
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isPrimaryActive ? (
            currentView === "edit" ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">
                    Body
                  </label>
                  <RichTextEditor
                    value={body}
                    onChange={setBody}
                    disabled={loading}
                  />
                </div>
              </>
            ) : (
              <EmailPreview html={previewHtml} />
            )
          ) : (
            currentView === "edit" ? (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={secondSubject}
                    onChange={(e) => setSecondSubject(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5">
                    Body
                  </label>
                  <RichTextEditor
                    value={secondBody}
                    onChange={setSecondBody}
                    disabled={loading}
                  />
                </div>
              </>
            ) : (
              <EmailPreview html={previewHtml} />
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--border)] shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="btn btn-dark text-sm px-5 py-2 opacity-70 hover:opacity-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || !canConfirm}
            className="btn btn-gold text-sm px-5 py-2 disabled:opacity-50"
          >
            {loading ? "Sending…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailPreview({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={html}
      title="Email preview"
      sandbox="allow-same-origin"
      className="w-full rounded-xl border border-[var(--border)] bg-[#f5f4f0]"
      style={{ height: "520px" }}
    />
  );
}
