"use client";

// The anonymous note to exec.
//
// A full page rather than a corner widget, and that is a design decision, not a
// layout one. The feedback button in the corner is for "this table is broken";
// this is for the thing somebody has been sitting on for three weeks. It gets
// room, a nav link they can find without being told, and copy that says exactly
// what happens to what they write — because a member who is unsure whether this
// is really anonymous will simply not use it, and an anonymous channel nobody
// trusts is worse than none at all: it looks like the club is listening.

import { useState } from "react";
import { Check, CircleAlert, Loader2, Send } from "lucide-react";
import {
  ANONYMOUS_TOPICS,
  MAX_CONTACT,
  MAX_MESSAGE,
  type AnonymousTopic,
} from "@/features/06-portal-feedback/lib/anonymous";

export function AnonymousNoteForm() {
  const [topic, setTopic] = useState<AnonymousTopic>("conduct");
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ recipients: string[] } | null>(null);

  async function submit() {
    const text = message.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, message: text, contact: contact.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        // The box is NOT cleared on a failure. Someone who just wrote six
        // paragraphs about something difficult does not get to write them
        // twice because the mail server had a bad minute.
        setError(json.error || "That didn't send. Try again in a moment.");
        return;
      }
      setSent({ recipients: (json.recipients as string[]) ?? [] });
      setMessage("");
      setContact("");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6">
        <p className="flex items-start gap-2.5 text-[15px] text-[var(--fg)]">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
          <span>
            <strong className="font-semibold text-[var(--bg-dark)]">Sent.</strong> It&rsquo;s in the
            inbox{sent.recipients.length === 1 ? "" : "es"} of{" "}
            {sent.recipients.join(" and ") || "the exec board"} — with no name on it.
          </span>
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          There is no copy of it in the portal and no record that you were the one who wrote it, so
          this page can&rsquo;t show it back to you. If you want to keep a copy, you needed to make
          one before pressing send.
        </p>
        <button onClick={() => setSent(null)} className="btn btn-gold mt-5 px-4 py-2 text-xs">
          Send another
        </button>
      </div>
    );
  }

  const remaining = MAX_MESSAGE - message.length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 md:p-6">
        <fieldset>
          <legend className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            What&rsquo;s this about
          </legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {ANONYMOUS_TOPICS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={topic === key}
                onClick={() => setTopic(key)}
                className={`rounded-xl border px-3.5 py-3 text-left text-[13px] font-semibold transition-colors ${
                  topic === key
                    ? "border-[var(--gold)] bg-[var(--gold)]/12 text-[var(--bg-dark)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-cream)]/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-5">
          <label
            htmlFor="anonymous-message"
            className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"
          >
            What you want them to know
          </label>
          <textarea
            id="anonymous-message"
            value={message}
            maxLength={MAX_MESSAGE}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            autoFocus
            placeholder="Take as much room as you need. Dates, names and specifics are what make something actionable — but say it however you can say it."
            className="mt-2 w-full resize-y rounded-xl border border-[var(--border)] px-3.5 py-3 text-sm leading-relaxed focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/50"
          />
          {remaining < 500 && (
            <p className="mt-1 text-right text-[11px] text-[var(--muted)]">
              {remaining} characters left
            </p>
          )}
        </div>

        <div className="mt-4">
          <label
            htmlFor="anonymous-contact"
            className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]"
          >
            How to reach you — optional
          </label>
          <input
            id="anonymous-contact"
            value={contact}
            maxLength={MAX_CONTACT}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Leave blank to stay completely anonymous"
            className="mt-2 w-full rounded-xl border border-[var(--border)] px-3.5 py-2.5 text-sm focus:border-[var(--gold)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/50"
          />
          <p className="mt-1.5 text-[12px] text-[var(--muted)]">
            Anything you type here is the <span className="font-semibold">only</span> thing in the
            note that says who you are — an email, a name, &ldquo;catch me after the next
            GBM&rdquo;. Blank means exec has no way to answer you, which is fine and is the default.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800"
          >
            <CircleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        <button
          onClick={submit}
          disabled={!message.trim() || busy}
          className="btn btn-gold mt-5 gap-2 px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Sending…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" aria-hidden />
              Send anonymously
            </>
          )}
        </button>
      </div>
    </div>
  );
}
