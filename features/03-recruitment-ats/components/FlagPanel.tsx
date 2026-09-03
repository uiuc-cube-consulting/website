"use client";

// One candidate's flags, in full: every note with its author, plus the controls to
// add one and to take one down.
//
// This is the counterpart to FlagBadge. The badge answers "has anyone raised
// something?" while you scan 150 names; this answers "what did they say, and is it
// still true?" once you have stopped on one person. Both rounds show it — the
// written console and the interview workspace — because the question "what do we
// already know about this person" does not change between them, and a note filed
// at an info night is most useful in the room where they are being interviewed.

import Link from "next/link";
import { useState } from "react";
import { wasFiledBeforeApplying, type Flag } from "@/features/03-recruitment-ats/lib/types";

function filedOn(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FlagPanel({
  applicantId,
  flags,
  onChanged,
  /** Rendered inside an already-titled card (the interview workspace) — the
   *  heading would be a second label on the same box. */
  heading = true,
}: {
  applicantId: string;
  flags: Flag[];
  onChanged: () => Promise<void> | void;
  heading?: boolean;
}) {
  const [color, setColor] = useState<"red" | "green">("red");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Which flag is mid-confirmation. Removing is one click plus one confirm, not a
  // browser `confirm()`: this component renders inside a candidate profile that a
  // misclick should never be able to edit, and a modal dialog stops the whole tab.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function submit() {
    if (!description.trim()) return;
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicant_id: applicantId, color, description: description.trim() }),
      });
      const res = await r.json();
      if (res.ok) {
        setDescription("");
        await onChanged();
      } else setToast(res.message || res.error || "Could not submit flag.");
    } catch {
      setToast("Could not submit flag.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    setToast(null);
    try {
      const r = await fetch(`/api/recruitment/flags?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const res = await r.json();
      if (res.ok) {
        setConfirming(null);
        await onChanged();
      } else setToast(res.message || res.error || "Could not remove flag.");
    } catch {
      setToast("Could not remove flag.");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div>
      {heading && <p className="eyebrow">Flags</p>}

      {flags.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No flags on this candidate.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {flags.map((f) => {
            const early = wasFiledBeforeApplying(f);
            const isConfirming = confirming === f.id;
            return (
              <li
                key={f.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.color === "red" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                  >
                    {f.color === "red" ? "Red flag" : "Green flag"}
                  </span>
                  {f.event && (
                    <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[11px] text-[var(--muted)]">
                      {f.event}
                    </span>
                  )}
                  {/* Filed at an event, before this application existed — so the
                      note was written about the person, not about their answers. */}
                  {early && (
                    <span className="rounded-full border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--gold-deep)]">
                      Before applying
                    </span>
                  )}
                  {/* `removable` is decided by the server, which is the only side
                      that knows who filed an anonymous flag. Absent = no button. */}
                  {f.removable && !isConfirming && (
                    <button
                      type="button"
                      onClick={() => { setConfirming(f.id); setToast(null); }}
                      className="ml-auto text-[11px] font-medium text-[var(--muted)] underline underline-offset-2 hover:text-[var(--gold-deep)]"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[var(--bg-dark)]">{f.description}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  — {f.submitter_email ?? "anonymous"}
                  {early && ` · ${filedOn(f.created_at)}`}
                </p>

                {isConfirming && (
                  <div className="mt-2 rounded-lg border border-[var(--border)] bg-white px-2.5 py-2">
                    <p className="text-[11px] text-[var(--bg-dark)]">
                      Remove this flag? It stops showing on their profile everywhere.
                    </p>
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        onClick={() => remove(f.id)}
                        disabled={removing === f.id}
                        className="rounded-full border border-red-300 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700 disabled:opacity-50"
                      >
                        {removing === f.id ? "Removing…" : "Yes, remove"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-[11px] font-semibold text-[var(--bg-dark)]"
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={() => setColor("red")}
          aria-pressed={color === "red"}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${color === "red" ? "border-red-300 bg-red-100 text-red-700" : "border-[var(--border)] bg-white text-[var(--bg-dark)]"}`}
        >
          Red flag
        </button>
        <button
          type="button"
          onClick={() => setColor("green")}
          aria-pressed={color === "green"}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${color === "green" ? "border-green-300 bg-green-100 text-green-700" : "border-[var(--border)] bg-white text-[var(--bg-dark)]"}`}
        >
          Green flag
        </button>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        placeholder="What happened? (required)"
        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
      />
      <button
        onClick={submit}
        disabled={busy || !description.trim()}
        className="btn btn-gold-outline mt-2 text-xs px-4 py-2 disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Submit flag"}
      </button>
      {toast && <p className="mt-2 text-sm text-[var(--gold-deep)]">{toast}</p>}
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        Someone who hasn&apos;t applied?{" "}
        <Link href="/portal/flags" className="underline hover:text-[var(--gold-deep)]">
          Flag them by email
        </Link>{" "}
        — it attaches when they apply.
      </p>
    </div>
  );
}
