"use client";

import { useState } from "react";
import type { Lead } from "@/features/02-pipeline-crm/lib/pipeline";

type Props = { lead: Lead; onClose: () => void; onSaved: () => void };

const FIELD =
  "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--bg-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--gold)]";

type KV = { key: string; value: string };

export function PipelineCardModal({ lead, onClose, onSaved }: Props) {
  const [name, setName] = useState(lead.name ?? "");
  const [company, setCompany] = useState(lead.company ?? "");
  const [owner, setOwner] = useState(lead.owner ?? "");
  const [industry, setIndustry] = useState(lead.industry ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [custom, setCustom] = useState<KV[]>(
    Object.entries(lead.custom ?? {}).map(([key, value]) => ({ key, value }))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setKV(i: number, patch: Partial<KV>) {
    setCustom((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    setBusy(true);
    setErr(null);
    const customObj: Record<string, string> = {};
    for (const { key, value } of custom) {
      const k = key.trim();
      if (k) customObj[k] = value;
    }
    try {
      const r = await fetch("/api/pipeline/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: lead.id,
          patch: { name, company, owner, industry, notes, custom: customObj },
        }),
      });
      const j = await r.json();
      if (j.ok) onSaved();
      else setErr(j.message || j.error || "Could not save.");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-extrabold text-[var(--bg-dark)]">Edit card</h3>
          <button onClick={onClose} aria-label="Close" className="text-[var(--muted)] hover:text-[var(--bg-dark)]">✕</button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="text-xs font-medium text-[var(--muted)]">Company</span>
            <input className={`mt-1 ${FIELD}`} value={company} onChange={(e) => setCompany(e.target.value)} />
          </label>
          <label className="block"><span className="text-xs font-medium text-[var(--muted)]">Contact name</span>
            <input className={`mt-1 ${FIELD}`} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block"><span className="text-xs font-medium text-[var(--muted)]">Owner</span>
            <input className={`mt-1 ${FIELD}`} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="e.g. PM: Sujan" />
          </label>
          <label className="block"><span className="text-xs font-medium text-[var(--muted)]">Industry</span>
            <input className={`mt-1 ${FIELD}`} value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </label>
        </div>

        <label className="mt-3 block"><span className="text-xs font-medium text-[var(--muted)]">Notes</span>
          <textarea className={`mt-1 ${FIELD}`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, next steps, who to loop in…" />
        </label>

        {/* Custom fields */}
        <div className="mt-4">
          <p className="text-xs font-medium text-[var(--muted)]">Custom fields</p>
          <div className="mt-2 space-y-2">
            {custom.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={`${FIELD} flex-1`} placeholder="Field" value={row.key} onChange={(e) => setKV(i, { key: e.target.value })} />
                <input className={`${FIELD} flex-1`} placeholder="Value" value={row.value} onChange={(e) => setKV(i, { value: e.target.value })} />
                <button onClick={() => setCustom((rows) => rows.filter((_, idx) => idx !== i))} aria-label="Remove field" className="px-2 text-[var(--muted)] hover:text-red-600">✕</button>
              </div>
            ))}
            <button onClick={() => setCustom((rows) => [...rows, { key: "", value: "" }])} className="text-sm font-semibold text-[var(--gold-deep)] hover:text-[var(--bg-dark)]">
              + Add field
            </button>
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-gold-outline text-xs px-4 py-2">Cancel</button>
          <button onClick={save} disabled={busy} className="btn btn-gold text-xs px-4 py-2 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
