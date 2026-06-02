"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type EmailPayload = { subject: string; body: string };

type Props = {
  initialSubject: string;
  initialBody: string;
  title: string;
  confirmLabel: string;
  onConfirm: (primary: EmailPayload, secondary?: EmailPayload) => void;
  onCancel: () => void;
  loading?: boolean;
  // Optional second email (e.g. requester notification)
  secondEmail?: {
    label: string;
    initialSubject: string;
    initialBody: string;
  };
};

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

  useEffect(() => {
    setSubject(initialSubject);
    setBody(initialBody);
  }, [initialSubject, initialBody]);

  useEffect(() => {
    if (secondEmail) {
      setSecondSubject(secondEmail.initialSubject);
      setSecondBody(secondEmail.initialBody);
    }
  }, [secondEmail?.initialSubject, secondEmail?.initialBody]);

  function handleConfirm() {
    const primary: EmailPayload = { subject, body };
    const secondary = secondEmail
      ? { subject: secondSubject, body: secondBody }
      : undefined;
    onConfirm(primary, secondary);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl border border-[var(--border)] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
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

        {/* Tabs (only shown if there's a second email) */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {(!secondEmail || activeTab === "primary") && (
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
                  Body (HTML)
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={14}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm font-mono focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2 resize-y"
                />
              </div>
            </>
          )}

          {secondEmail && activeTab === "secondary" && (
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
                  Body (HTML)
                </label>
                <textarea
                  value={secondBody}
                  onChange={(e) => setSecondBody(e.target.value)}
                  rows={14}
                  className="w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm font-mono focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2 resize-y"
                />
              </div>
            </>
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
            disabled={loading || !subject.trim() || !body.trim()}
            className="btn btn-gold text-sm px-5 py-2 disabled:opacity-50"
          >
            {loading ? "Sending…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

