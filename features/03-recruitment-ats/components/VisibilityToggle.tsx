"use client";

// Exec-only control: open/close the recruiting area for everyone else. Closing
// it does not touch any data — applicants, flags, reviews, and decisions are
// all still there when it reopens. It only hides the nav link and the pages,
// and the API refuses non-exec reads/writes while closed.

import { useEffect, useState } from "react";

export function VisibilityToggle() {
  const [visible, setVisible] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/recruitment/visibility")
      .then((r) => r.json())
      .then((d) => setVisible(Boolean(d.visible)))
      .catch(() => setError("Could not load recruiting visibility."));
  }, []);

  async function toggle() {
    if (visible === null) return;
    const next = !visible;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/recruitment/visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visible: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || data.message || "Failed to update.");
      setVisible(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <p className="text-sm font-semibold text-[var(--bg-dark)]">Recruiting visibility</p>
      <p className="mt-1 max-w-xl text-sm text-[var(--muted)]">
        Open: every member can see applicants, look them up, and submit flags. Closed: only exec
        can see this area — the nav link and pages disappear for everyone else. Nothing is
        deleted either way.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={visible === null || saving}
          className={
            "rounded-full px-4 py-2 text-xs font-semibold transition disabled:opacity-50 " +
            (visible
              ? "bg-[var(--gold)] text-[var(--bg-dark)]"
              : "border border-[var(--border)] text-[var(--muted)] hover:bg-white")
          }
        >
          {visible === null ? "Loading…" : visible ? "Open — click to close" : "Closed — click to open"}
        </button>
        {saving && <span className="text-xs text-[var(--muted)]">Saving…</span>}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
