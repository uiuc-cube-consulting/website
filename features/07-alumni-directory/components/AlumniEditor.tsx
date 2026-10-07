"use client";

import { useEffect, useState } from "react";
import { CAMPUS_LABEL, CAMPUS_STATUSES, type Alumnus, type CampusStatus } from "@/features/07-alumni-directory/lib/alumni";

type Draft = {
  full_name: string;
  linkedin_url: string;
  headline: string;
  position: string;
  company: string;
  major: string;
  email: string;
  phone: string;
  campus_status: CampusStatus;
  open_to_mentor: boolean;
};

function draftOf(a: Alumnus | null): Draft {
  return {
    full_name: a?.full_name ?? "",
    linkedin_url: a?.linkedin_url ?? "",
    headline: a?.headline ?? "",
    position: a?.position ?? "",
    company: a?.company ?? "",
    major: a?.major ?? "",
    email: a?.email ?? "",
    phone: a?.phone ?? "",
    campus_status: a?.campus_status ?? "unknown",
    open_to_mentor: a?.open_to_mentor ?? false,
  };
}

const labelClass = "block text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-1.5";
const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-[var(--border)] text-sm focus:outline-2 focus:outline-[var(--gold)] focus:outline-offset-2";

const TEXT_FIELDS: { key: Exclude<keyof Draft, "campus_status" | "open_to_mentor">; label: string; placeholder?: string; wide?: boolean }[] = [
  { key: "full_name", label: "Name" },
  { key: "linkedin_url", label: "LinkedIn", placeholder: "linkedin.com/in/…" },
  { key: "headline", label: "Headline", placeholder: "What their LinkedIn says now", wide: true },
  { key: "position", label: "Position" },
  { key: "company", label: "Company" },
  { key: "major", label: "Major", wide: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
];

/** Exec-only add / edit / remove modal. `alumnus` null means adding. */
export function AlumniEditor({
  alumnus,
  onCancel,
  onSaved,
  onDeleted,
}: {
  alumnus: Alumnus | null;
  onCancel: () => void;
  onSaved: (row: Alumnus) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState(() => draftOf(alumnus));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two-step remove instead of window.confirm, which blocks the page.
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(alumnus ? `/api/alumni/${alumnus.id}` : "/api/alumni", {
        method: alumnus ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status}).`);
      onSaved(json.alumnus as Alumnus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!alumnus) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/alumni/${alumnus.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Remove failed (${res.status}).`);
      onDeleted(alumnus.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed.");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onCancel} />
      <form
        onSubmit={save}
        role="dialog"
        aria-modal="true"
        aria-labelledby="alumni-editor-title"
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-[var(--border)] bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <h2 id="alumni-editor-title" className="font-display text-lg font-bold text-[var(--bg-dark)]">
            {alumnus ? `Edit ${alumnus.full_name}` : "Add an alum"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            className="text-[var(--muted)] transition-colors hover:text-[var(--bg-dark)]"
          >
            ✕
          </button>
        </div>

        <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
              <label htmlFor={`alum-${f.key}`} className={labelClass}>
                {f.label}
              </label>
              <input
                id={`alum-${f.key}`}
                value={draft[f.key]}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                required={f.key === "full_name"}
                maxLength={200}
                className={inputClass}
              />
            </div>
          ))}

          <fieldset className="sm:col-span-2">
            <legend className={labelClass}>Where they are</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              {CAMPUS_STATUSES.map((s) => (
                <label key={s} className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="campus_status"
                    checked={draft.campus_status === s}
                    onChange={() => set("campus_status", s)}
                    className="accent-[var(--gold-deep)]"
                  />
                  {CAMPUS_LABEL[s]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.open_to_mentor}
              onChange={(e) => set("open_to_mentor", e.target.checked)}
              className="h-4 w-4 accent-[var(--gold-deep)]"
            />
            Open to mentoring members
          </label>
        </div>

        {error && (
          <p role="alert" className="mx-6 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border)] px-6 py-4">
          {alumnus &&
            (confirmingDelete ? (
              <span className="flex items-center gap-2 text-sm">
                Remove {alumnus.full_name}?
                <button type="button" onClick={remove} disabled={busy} className="font-semibold text-red-700 hover:underline">
                  Yes, remove
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy} className="text-[var(--muted)] hover:underline">
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                className="text-sm font-semibold text-red-700 hover:underline"
              >
                Remove
              </button>
            ))}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} disabled={busy} className="btn btn-gold-outline text-sm">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="btn btn-gold text-sm">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
