"use client";

// "Send anonymously" on the dashboard, and the dialog behind it.
//
// It lives beside "Email the board" because that is the sentence a member is
// already reading when they realise they want to say something and would rather
// not sign it — one card, two ways to reach exec, the difference between them
// stated plainly. It is not in the nav: a permanent "Anonymous Note" tab is a
// standing accusation that something is wrong, and it crowded out the pages
// people open every week.
//
// The dialog leads with what happens to the note rather than with the textarea.
// A member who is unsure whether this is really anonymous will simply not use
// it, and a channel nobody trusts is worse than none at all — it looks like the
// club is listening.

import { useCallback, useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { AnonymousNoteForm } from "./AnonymousNoteForm";

export function AnonymousNoteDialog({ recipients }: { recipients: string[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Back to the launcher rather than dropping focus on <body>, which would
    // send the next Tab to the top of the page.
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    // The page behind a modal must not scroll under it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="btn text-xs px-4 py-2 self-start md:self-auto border border-[var(--border)] text-[var(--bg-dark)] hover:border-[var(--gold)] hover:bg-[var(--bg-cream)]/60 gap-1.5"
      >
        <ShieldCheck className="w-3.5 h-3.5 text-[var(--gold-deep)]" aria-hidden />
        Send anonymously
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8 md:items-center">
          {/* Click-away on the backdrop only. A click that starts inside the
              panel and drifts out — selecting text in the textarea, say —
              must not throw away what someone just wrote. */}
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="anonymous-note-title"
            tabIndex={-1}
            className="relative w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-white shadow-2xl outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-6 py-5">
              <div>
                <p className="eyebrow">To the exec board</p>
                <h2
                  id="anonymous-note-title"
                  className="mt-1.5 font-display text-2xl font-extrabold text-[var(--bg-dark)]"
                >
                  Say it anonymously.
                </h2>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1 text-[var(--muted)] transition-colors hover:bg-[var(--bg-cream)] hover:text-[var(--bg-dark)]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              <p className="text-sm text-[var(--muted)]">
                Anything you want exec to know and would rather not put your name to — how
                something was handled, something a member did, how the club is being run, or an
                idea you&rsquo;d rather float without owning. It goes to{" "}
                {recipients.map((r, i) => (
                  <span key={r}>
                    {i > 0 && (i === recipients.length - 1 ? " and " : ", ")}
                    <span className="font-semibold text-[var(--bg-dark)]">{r}</span>
                  </span>
                ))}
                , and nowhere else.
              </p>

              {/* The honesty block. Every line is checkable against the code,
                  and it is written in what-we-do terms rather than promises —
                  the only version of this worth shipping is one where the
                  claims are true, including the last one. */}
              <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/50 p-4 text-[13px] leading-relaxed">
                <p className="font-semibold text-[var(--bg-dark)]">What actually happens</p>
                <ul className="mt-2 space-y-1.5 text-[var(--muted)]">
                  <li>
                    <span className="font-semibold text-[var(--bg-dark)]">The email carries</span>{" "}
                    what you wrote, the topic, the time, and whatever you put in the contact box.
                  </li>
                  <li>
                    <span className="font-semibold text-[var(--bg-dark)]">It does not carry</span>{" "}
                    your name, email, role, year, or which page you sent it from.
                  </li>
                  <li>
                    <span className="font-semibold text-[var(--bg-dark)]">
                      The portal keeps no copy.
                    </span>{" "}
                    Your note isn&rsquo;t saved to any database — once sent it exists in those
                    inboxes and nowhere else, so this page can&rsquo;t show it back to you.
                  </li>
                  <li>
                    <span className="font-semibold text-[var(--bg-dark)]">
                      The one thing recorded
                    </span>{" "}
                    is a spam counter: a one-way hash of your address and the hour, so nobody can
                    flood two inboxes. Not the address, and nothing tying you to what you wrote.
                    Someone holding both the database and the server&rsquo;s secret key could tell
                    that <em>an</em> account sent something in some hour. That&rsquo;s the honest
                    limit of it.
                  </li>
                </ul>
                <p className="mt-3 border-t border-[var(--border)] pt-3 text-[var(--muted)]">
                  If this involves someone who reads that inbox, or you want it on the record
                  outside the club, UIUC&rsquo;s{" "}
                  <a
                    href="https://wecare.illinois.edu/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[var(--gold-deep)] hover:underline"
                  >
                    We Care
                  </a>{" "}
                  and the{" "}
                  <a
                    href="https://ethicspoint.illinois.edu/"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[var(--gold-deep)] hover:underline"
                  >
                    University ethics line
                  </a>{" "}
                  exist for that and are not run by us.
                </p>
              </div>

              <div className="mt-5">
                <AnonymousNoteForm />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
