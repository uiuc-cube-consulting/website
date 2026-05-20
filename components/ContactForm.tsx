"use client";

import { useState } from "react";
import { Send, CheckCircle2 } from "lucide-react";

type State = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("submitting");
    setError(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const formspreeId = process.env.NEXT_PUBLIC_FORMSPREE_ID;
    if (!formspreeId) {
      // Dev fallback: simulate success after a tick so the UI is still reviewable.
      await new Promise((r) => setTimeout(r, 400));
      setState("success");
      form.reset();
      return;
    }
    try {
      const r = await fetch(`https://formspree.io/f/${formspreeId}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data,
      });
      if (!r.ok) throw new Error(`Submission failed (${r.status})`);
      setState("success");
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-8 md:p-10 text-center">
        <CheckCircle2 className="mx-auto text-[var(--brand-gold)]" size={36} />
        <h3 className="mt-4 text-xl font-semibold text-[var(--brand-navy)]">Thanks for submitting!</h3>
        <p className="mt-2 text-sm text-[var(--muted)]">
          We&apos;ll be in touch shortly. In the meantime, feel free to drop us a line at{" "}
          <a className="underline" href="mailto:CUBEUIUC@gmail.com">CUBEUIUC@gmail.com</a>.
        </p>
        <button
          type="button"
          className="mt-6 btn btn-primary"
          onClick={() => setState("idle")}
        >
          Send another message
        </button>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--border)] bg-white px-4 py-3 text-sm focus:border-[var(--brand-navy)] focus:outline-2 focus:outline-[var(--brand-gold)] focus:outline-offset-2 transition-colors";

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-[var(--border)] bg-white p-6 md:p-8 space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-[var(--brand-navy)] mb-1.5">
            First name
          </label>
          <input id="firstName" name="firstName" required className={inputCls} autoComplete="given-name" />
        </div>
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-[var(--brand-navy)] mb-1.5">
            Last name
          </label>
          <input id="lastName" name="lastName" required className={inputCls} autoComplete="family-name" />
        </div>
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[var(--brand-navy)] mb-1.5">
          Email
        </label>
        <input id="email" name="email" type="email" required className={inputCls} autoComplete="email" />
      </div>
      <div>
        <label htmlFor="message" className="block text-sm font-medium text-[var(--brand-navy)] mb-1.5">
          Message
        </label>
        <textarea id="message" name="message" required rows={5} className={inputCls + " resize-y"} />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="btn btn-primary w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === "submitting" ? "Sending…" : (<>Send <Send size={16} /></>)}
      </button>
    </form>
  );
}
