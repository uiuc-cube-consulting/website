"use client";

import { useState } from "react";

type Status = { kind: "idle" | "submitting" | "ok" | "demo" | "error"; message?: string };

const FIELD =
  "w-full rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-[15px] text-[var(--bg-dark)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]";

export function IntakeForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: "submitting" });
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try {
      const r = await fetch("/api/recruitment/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (data.ok) setStatus({ kind: "ok" });
      else if (data.demo) setStatus({ kind: "demo", message: data.message });
      else setStatus({ kind: "error", message: data.error || "Something went wrong." });
    } catch {
      setStatus({ kind: "error", message: "Network error. Please try again." });
    }
  }

  if (status.kind === "ok") {
    return (
      <div className="rounded-3xl border border-[var(--border)] bg-white p-8 text-center">
        <h2 className="font-display text-2xl font-extrabold text-[var(--bg-dark)]">Application received.</h2>
        <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">
          Thanks for applying to CUBE. We&rsquo;ll be in touch by email about next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-3xl border border-[var(--border)] bg-white p-6 md:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-[var(--bg-dark)]">Full name *</span>
          <input name="name" required className={`mt-1.5 ${FIELD}`} placeholder="Jordan Ellis" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--bg-dark)]">Email *</span>
          <input name="email" type="email" required className={`mt-1.5 ${FIELD}`} placeholder="you@illinois.edu" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--bg-dark)]">Year</span>
          <input name="year" className={`mt-1.5 ${FIELD}`} placeholder="Sophomore" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--bg-dark)]">Major</span>
          <input name="major" className={`mt-1.5 ${FIELD}`} placeholder="Industrial Engineering" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-[var(--bg-dark)]">College</span>
          <input name="college" className={`mt-1.5 ${FIELD}`} placeholder="Grainger Engineering" />
        </label>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-[var(--bg-dark)]">Why CUBE?</span>
        <textarea name="why" rows={3} className={`mt-1.5 ${FIELD}`} placeholder="What draws you to consulting at CUBE?" />
      </label>
      <label className="mt-4 block">
        <span className="text-sm font-medium text-[var(--bg-dark)]">Something you&rsquo;re proud of</span>
        <textarea name="proud" rows={3} className={`mt-1.5 ${FIELD}`} placeholder="A project, role, or result you led." />
      </label>

      {status.kind === "demo" && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{status.message}</p>
      )}
      {status.kind === "error" && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{status.message}</p>
      )}

      <button type="submit" disabled={status.kind === "submitting"} className="btn btn-gold mt-6 disabled:opacity-60">
        {status.kind === "submitting" ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
