"use client";
import { useEffect, useState } from "react";
import type { Alumnus } from "@/features/07-alumni-directory/lib/alumni";

/** Manual source review. This does not scrape LinkedIn or verify a degree. */
export function ReviewEditor({ row, endpoint = "/api/directory/review", onClose, onSaved }: {
  row: Alumnus; endpoint?: string; onClose: () => void; onSaved: (review: NonNullable<Alumnus["review"]>) => void;
}) {
  const [identity, setIdentity] = useState(row.review?.identity_status ?? "unknown");
  const [uiuc, setUiuc] = useState(row.review?.uiuc_status ?? "unknown");
  const [source, setSource] = useState(row.review?.source_url ?? "");
  const [notes, setNotes] = useState(row.review?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onClose]);
  const input = "mt-2 w-full rounded-lg border border-[var(--border)] bg-white p-3 text-sm";
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="review-heading">
    <form className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        const res = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_kind: row.member_id ? "member" : "alumni", target_id: row.member_id ?? row.id, identity_status: identity, uiuc_status: uiuc, source_url: source, notes }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not save the review.");
        onSaved({ identity_status: identity, uiuc_status: uiuc, source_url: source, notes, checked_at: data.checked_at });
      } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
    }}>
      <h2 id="review-heading" className="text-xl">Review sources · {row.full_name}</h2>
      <p className="text-sm text-[var(--muted)]">Check that the LinkedIn profile is the same person and that the education explicitly says Urbana-Champaign. An indexed snippet is a lead, not independent degree verification. Do not infer education from CUBE membership.</p>
      {row.linkedin_url && <a className="inline-block text-sm font-semibold text-[var(--brand)] underline" href={row.linkedin_url} target="_blank" rel="noreferrer">Open current LinkedIn ↗</a>}
      <label className="block text-sm font-semibold">LinkedIn identity evidence<select className={input} value={identity} onChange={(e) => setIdentity(e.target.value as typeof identity)}><option value="unknown">Not reviewed / inconclusive</option><option value="evidence_found">Same-person evidence reviewed</option><option value="conflict">Potential wrong-person match</option></select></label>
      <label className="block text-sm font-semibold">UIUC education evidence<select className={input} value={uiuc} onChange={(e) => setUiuc(e.target.value as typeof uiuc)}><option value="unknown">Not reviewed / inconclusive</option><option value="evidence_found">Explicit UIUC evidence reviewed</option><option value="conflict">Conflicting school information</option></select></label>
      <label className="block text-sm font-semibold">Supporting source URL<input className={input} type="url" maxLength={500} placeholder="https://www.linkedin.com/in/… or an illinois.edu source" value={source} onChange={(e) => setSource(e.target.value)} /></label>
      <label className="block text-sm font-semibold">Exec-only review notes<textarea rows={3} maxLength={600} className={input} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3"><button disabled={busy} className="btn btn-gold">{busy ? "Saving…" : "Save source review"}</button><button type="button" disabled={busy} className="text-sm font-semibold" onClick={onClose}>Cancel</button></div>
    </form>
  </div>;
}
