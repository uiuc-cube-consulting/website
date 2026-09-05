"use client";

// The floating "Feedback" button, and the panel behind it.
//
// Renders on every portal page (mounted once in app/portal/layout.tsx). A
// member takes a picture of what they're looking at, writes a line about it,
// and a GitHub issue appears in the website repo signed with their name and
// email — no forwarding a screenshot to someone who then has to describe it
// again in a tracker.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Bug, Camera, Check, CircleAlert, ExternalLink, ImageUp, Lightbulb, Loader2, MessageSquarePlus, Trash2, X } from "lucide-react";
import {
  canCaptureScreen,
  captureScreen,
  formatBytes,
  fromFile,
  imageFromClipboard,
  type Shot,
} from "@/features/06-portal-feedback/lib/capture";
import { MAX_DESCRIPTION, type FeedbackKind } from "@/features/06-portal-feedback/lib/types";

type Filed = { number: number; url: string };

export function FeedbackWidget() {
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [description, setDescription] = useState("");
  const [shot, setShot] = useState<Shot | null>(null);

  const [busy, setBusy] = useState(false);
  // While a screen share is being picked, the widget hides itself — otherwise
  // the first thing in every screenshot is the panel covering the bug.
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Filed | null>(null);

  // `canCaptureScreen()` reads `navigator`, so the server and the client's first
  // render must disagree about it or hydration breaks. useSyncExternalStore is
  // the sanctioned way to say that: `false` on the server, the real answer on
  // the client, and no state written from inside an effect. The subscribe
  // callback is a no-op because the answer cannot change after load.
  const screenCapture = useSyncExternalStore(
    () => () => {},
    canCaptureScreen,
    () => false
  );

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const reset = useCallback(() => {
    setDescription("");
    setShot(null);
    setError(null);
    setFiled(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to the launcher rather than dropping it on <body>, which
    // would send the next Tab back to the top of the page.
    buttonRef.current?.focus();
  }, []);

  // Escape closes the panel — but never mid-capture, when the browser's own
  // picker is up and Escape belongs to it.
  useEffect(() => {
    if (!open || capturing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, capturing, close]);

  // Paste anywhere while the panel is open. Cmd+Shift+4 into the clipboard and
  // then Cmd+V is how most Mac users already take a screenshot, and it works
  // when the screen-share picker is unavailable or declined.
  useEffect(() => {
    if (!open) return;
    async function onPaste(e: ClipboardEvent) {
      const file = imageFromClipboard(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      await accept(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  useEffect(() => {
    if (open && !filed) textareaRef.current?.focus();
  }, [open, filed]);

  async function accept(file: Blob) {
    setError(null);
    try {
      setShot(await fromFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That image couldn't be read.");
    }
  }

  async function onCapture() {
    setError(null);
    setCapturing(true);
    try {
      // Let the hide actually paint before the picker opens. Without this the
      // panel is still on screen in the frame the browser grabs.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      setShot(await captureScreen());
    } catch (err) {
      // Cancelling the picker throws NotAllowedError. That's a decision, not a
      // failure — saying "permission denied" at someone who just clicked
      // Cancel is noise.
      const aborted = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "AbortError");
      if (!aborted) {
        setError(err instanceof Error ? err.message : "Screen capture failed.");
      }
    } finally {
      setCapturing(false);
    }
  }

  async function submit() {
    const text = description.trim();
    if (!text || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          description: text,
          page_path: pathname,
          screenshot: shot?.dataUrl ?? null,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error || "Couldn't file that. Try again in a moment.");
        return;
      }
      setFiled(json.issue as Filed);
      setDescription("");
      setShot(null);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  // Hidden outright during a capture, so neither the panel nor the launcher
  // ends up in the picture.
  if (capturing) return null;

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--bg-dark)] text-[var(--fg-on-dark)] pl-4 pr-5 py-3 text-[13px] font-semibold shadow-lg shadow-black/20 hover:bg-[var(--bg-dark-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)] transition-colors print:hidden"
      >
        <MessageSquarePlus className="w-4 h-4 text-[var(--gold)]" aria-hidden />
        Feedback
      </button>
    );
  }

  const remaining = MAX_DESCRIPTION - description.length;

  return (
    <div
      role="dialog"
      aria-label="Send feedback"
      className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2.5rem))] max-h-[min(34rem,calc(100vh-2.5rem))] flex flex-col rounded-2xl bg-white border border-[var(--border)] shadow-2xl print:hidden"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border)]">
        <h2 className="font-display font-bold text-[15px] text-[var(--bg-dark)]">
          {filed ? "Thanks — it's filed" : "Send feedback"}
        </h2>
        <button
          type="button"
          onClick={close}
          aria-label="Close feedback"
          className="p-1 rounded-md text-[var(--muted)] hover:bg-[var(--bg-cream)] hover:text-[var(--bg-dark)] transition-colors"
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
      </div>

      {filed ? (
        <div className="px-4 py-5 space-y-4">
          <p className="flex items-start gap-2 text-sm text-[var(--fg)]">
            <Check className="w-4 h-4 mt-0.5 shrink-0 text-green-600" aria-hidden />
            <span>
              Opened as issue <strong>#{filed.number}</strong>. It&apos;s tagged with your name and
              email so we can follow up.
            </span>
          </p>
          <a
            href={filed.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--gold-deep)] hover:underline"
          >
            View it on GitHub
            <ExternalLink className="w-3.5 h-3.5" aria-hidden />
          </a>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={reset} className="btn btn-gold text-xs px-4 py-2">
              Send another
            </button>
            <button
              type="button"
              onClick={close}
              className="btn text-xs px-4 py-2 border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-cream)]"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {/* Two choices, mapped to the `bug` / `enhancement` labels. */}
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type of feedback">
              {([
                { value: "bug", label: "Something's broken", Icon: Bug },
                { value: "idea", label: "An idea", Icon: Lightbulb },
              ] as const).map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={kind === value}
                  onClick={() => setKind(value)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-semibold text-left transition-colors ${
                    kind === value
                      ? "border-[var(--gold)] bg-[var(--gold)]/12 text-[var(--bg-dark)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-cream)]/60"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden />
                  {label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="feedback-description" className="sr-only">
                What happened, or what would you like?
              </label>
              <textarea
                id="feedback-description"
                ref={textareaRef}
                value={description}
                maxLength={MAX_DESCRIPTION}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder={
                  kind === "bug"
                    ? "What did you expect to happen, and what happened instead?"
                    : "What would you like the portal to do?"
                }
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/50 focus:border-[var(--gold)]"
              />
              {remaining < 200 && (
                <p className="mt-1 text-[11px] text-[var(--muted)] text-right">{remaining} characters left</p>
              )}
            </div>

            {shot ? (
              <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from the canvas; next/image can't optimise it and doesn't need to. */}
                <img src={shot.dataUrl} alt="Screenshot you attached" className="w-full max-h-40 object-contain bg-[var(--bg-cream)]/50" />
                <div className="flex items-center justify-between gap-2 px-3 py-2 text-[11px] text-[var(--muted)] border-t border-[var(--border)]">
                  <span>
                    {shot.width}×{shot.height} · {formatBytes(shot.bytes)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShot(null)}
                    className="inline-flex items-center gap-1 font-semibold hover:text-red-700 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  {screenCapture && (
                    <button
                      type="button"
                      onClick={onCapture}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5 text-[12px] font-semibold text-[var(--bg-dark)] hover:bg-[var(--bg-cream)]/60 transition-colors"
                    >
                      <Camera className="w-4 h-4" aria-hidden />
                      Capture screen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5 text-[12px] font-semibold text-[var(--bg-dark)] hover:bg-[var(--bg-cream)]/60 transition-colors"
                  >
                    <ImageUp className="w-4 h-4" aria-hidden />
                    Upload
                  </button>
                </div>
                <p className="text-[11px] text-[var(--muted)]">
                  …or paste an image straight in. Optional, but a picture usually saves a round trip.
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    // Cleared so choosing the SAME file twice still fires
                    // `change` — otherwise a removed-then-reattached shot
                    // silently does nothing.
                    e.target.value = "";
                    if (file) await accept(file);
                  }}
                />
              </div>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">
                <CircleAlert className="w-4 h-4 mt-px shrink-0" aria-hidden />
                <span>{error}</span>
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-[var(--border)]">
            {/* Shown, not just sent: the report carries the page and the
                member's name into a PUBLIC issue, and they should be able to
                see that before they press the button. */}
            <span className="text-[11px] text-[var(--muted)] truncate" title={pathname}>
              Filed against <code className="font-mono">{pathname}</code>
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={!description.trim() || busy}
              className="btn btn-gold text-xs px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  Filing…
                </>
              ) : (
                "Submit"
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
