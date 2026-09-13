"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, Loader2, X } from "lucide-react";
import {
  POINT_CATEGORIES,
  MAX_NOTE,
  categoryLabel,
  eventsIn,
  findEvent,
  missingRequiredEvents,
  progressFor,
  repeatsLeft,
  type Cohort,
  type PointCategory,
  type SubmissionRow,
  type SubmissionStatus,
} from "@/lib/point-catalog";

export type SubmissionsResponse = {
  rows: SubmissionRow[];
  isExec: boolean;
  cohort: Cohort;
  tableMissing?: boolean;
  error?: string;
};

/** "2026-09-13" or an ISO timestamp → "Sep 13". Bare dates are read as local days. */
export function formatDay(value: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_STYLES: Record<SubmissionStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};

export function SubmissionStatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[status]}`}>
      {status}
    </span>
  );
}

export function evidenceUrl(id: string): string {
  return `/api/points/submissions/${id}/evidence`;
}

/**
 * Phone photos are 3–10 MB, more than a request can carry. Re-encode to a JPEG
 * no larger than 1600px on its long side, which is plenty to see who is in the
 * room. Browsers apply the photo's EXIF rotation when drawing it, so portrait
 * shots stay upright.
 */
async function compressPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file couldn't be opened as an image. Try a JPEG or PNG."));
      el.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't process that photo.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The member's side: progress, the submit form, and their own submissions. */
export function PointSubmissions() {
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/points/submissions", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Failed to load (${r.status})`);
      setData(j);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  // Same IIFE pattern as PointsLookup, so no setState runs synchronously in the effect.
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const rows = data?.rows ?? [];
  const cohort = data?.cohort ?? "returning";

  return (
    <div className="space-y-6">
      {data?.tableMissing && (
        <p className="rounded-xl px-4 py-3 text-sm text-amber-800 bg-amber-50 border border-amber-200">
          Point submissions aren&rsquo;t switched on yet. Exec need to run <code>db/point-submissions.sql</code> in
          Supabase.
        </p>
      )}
      {loadError && (
        <p className="text-sm text-red-700" role="alert">
          {loadError}
        </p>
      )}

      {data && <ProgressCards rows={rows} cohort={cohort} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <SubmitForm
          rows={rows}
          cohort={cohort}
          disabled={data === null || Boolean(data.tableMissing)}
          onSubmitted={load}
        />
        <MySubmissions rows={rows} loading={data === null && !loadError} />
      </div>
    </div>
  );
}

function ProgressCards({ rows, cohort }: { rows: SubmissionRow[]; cohort: Cohort }) {
  const progress = progressFor(cohort, rows);
  const missing = missingRequiredEvents(cohort, rows);

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {progress.map((p) => {
          const met = p.approved >= p.required;
          const pct = Math.min(100, Math.round((p.approved / p.required) * 100));
          return (
            <div key={p.category} className="rounded-2xl border border-[var(--border)] bg-white p-5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display font-bold text-[var(--bg-dark)]">{p.label}</p>
                <p className="text-sm tabular-nums">
                  <span className="font-display font-extrabold text-lg text-[var(--bg-dark)]">{p.approved}</span>
                  <span className="text-[var(--muted)]"> / {p.required}</span>
                </p>
              </div>
              <div
                className="mt-3 h-2 rounded-full bg-[var(--bg-cream)] overflow-hidden"
                role="progressbar"
                aria-label={`${p.label} points`}
                aria-valuemin={0}
                aria-valuemax={p.required}
                aria-valuenow={p.approved}
              >
                <div
                  className={`h-full rounded-full ${met ? "bg-emerald-600" : "bg-[var(--gold)]"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {met ? "Requirement met" : `${p.required - p.approved} more needed`}
                {p.pending > 0 && ` · ${p.pending} pending review`}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-[var(--muted)] leading-relaxed">
        {cohort === "new" ? "New-member requirements." : "Returning-member requirements."} Only approved
        submissions count toward these.
        {missing.length > 0 && <> Still required: {missing.map((e) => e.label).join(", ")}.</>}
      </p>
    </div>
  );
}

const fieldLabel = "text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";
const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]";

function SubmitForm({
  rows,
  cohort,
  disabled,
  onSubmitted,
}: {
  rows: SubmissionRow[];
  cohort: Cohort;
  disabled: boolean;
  onSubmitted: () => Promise<void>;
}) {
  const [category, setCategory] = useState<PointCategory>("fundamentals");
  const [eventKey, setEventKey] = useState("");
  // Starts empty rather than today: the server renders this in UTC, and a
  // default date would mismatch the member's local day in the evening.
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = findEvent(eventKey);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPhotoBusy(true);
    try {
      setPhoto(await compressPhoto(file));
    } catch (err) {
      setPhoto(null);
      setError(err instanceof Error ? err.message : "That photo couldn't be read.");
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setPhotoBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    if (!selected) {
      setError("Pick the event this is for.");
      return;
    }
    if (!date) {
      setError("Enter the date of the event.");
      return;
    }
    if (!photo) {
      setError("Attach a photo of you at the event.");
      return;
    }

    setBusy(true);
    try {
      const r = await fetch("/api/points/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_key: selected.key, occurred_on: date, note: note.trim() || null, photo }),
      });
      const j: { error?: string } = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Couldn't submit (${r.status}).`);
      setDone(`Submitted "${selected.label}" for review.`);
      setEventKey("");
      setDate("");
      setNote("");
      setPhoto(null);
      await onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[var(--border)] bg-white p-5 md:p-6 space-y-5">
      <div>
        <p className="font-display font-bold text-[var(--bg-dark)]">Submit points</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Pick what you did and attach a photo of you there. Exec review every submission before the points count.
        </p>
      </div>

      <fieldset>
        <legend className={fieldLabel}>Category</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {POINT_CATEGORIES.map((c) => {
            const active = category === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCategory(c.key);
                  setEventKey("");
                }}
                className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                  active
                    ? "bg-[var(--bg-dark)] text-white border-[var(--bg-dark)]"
                    : "border-[var(--border)] text-[var(--bg-dark)] hover:border-[var(--gold)]"
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className={fieldLabel}>Event</legend>
        <ul className="mt-2 space-y-1.5">
          {eventsIn(category).map((ev) => {
            const left = repeatsLeft(ev, rows);
            const full = left === 0;
            const checked = eventKey === ev.key;
            return (
              <li key={ev.key}>
                <label
                  className={`flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                    full ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-[var(--gold)]"
                  } ${checked ? "border-[var(--gold)] bg-[var(--bg-cream)]/50" : "border-[var(--border)]"}`}
                >
                  <span className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="radio"
                      name="point-event"
                      value={ev.key}
                      checked={checked}
                      disabled={full}
                      onChange={() => setEventKey(ev.key)}
                      className="mt-0.5 accent-[var(--gold-deep)]"
                    />
                    <span className="text-[var(--bg-dark)]">
                      {ev.label}
                      {cohort === "new" && ev.requiredForNewCohort && (
                        <span className="ml-2 inline-block rounded-full bg-amber-100 text-amber-800 text-[10px] font-semibold px-2 py-0.5 align-middle">
                          Required
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--muted)] tabular-nums text-right">
                    {ev.points} {ev.points === 1 ? "pt" : "pts"}
                    <br />
                    {full ? "limit reached" : `${left} of ${ev.maxRepeats} left`}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className={fieldLabel}>Date of event</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>

        <div>
          <span className={fieldLabel}>Photo evidence</span>
          {photo ? (
            <div className="mt-2 relative inline-block">
              {/* A local data URL preview; next/image has nothing to optimise here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo}
                alt="The photo you're submitting"
                className="h-24 w-auto rounded-xl border border-[var(--border)] object-cover"
              />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                aria-label="Remove photo"
                className="absolute -top-2 -right-2 grid place-items-center w-6 h-6 rounded-full bg-[var(--bg-dark)] text-white"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] cursor-pointer hover:border-[var(--gold)] hover:text-[var(--bg-dark)]">
              {photoBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              {photoBusy ? "Processing…" : "Add a photo"}
              <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="sr-only" />
            </label>
          )}
        </div>
      </div>

      <label className="block">
        <span className={fieldLabel}>
          Note <span className="normal-case font-normal tracking-normal">(optional)</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={MAX_NOTE}
          rows={2}
          placeholder="Who it was with, or anything exec should know"
          className={inputClass}
        />
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-sm text-emerald-700 inline-flex items-center gap-1.5">
          <Check size={14} /> {done}
        </p>
      )}

      <button
        type="submit"
        disabled={disabled || busy || photoBusy}
        className="btn btn-gold text-sm px-5 py-2 inline-flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
      >
        {busy && <Loader2 size={14} className="animate-spin" />}
        Submit for review
      </button>
    </form>
  );
}

function MySubmissions({ rows, loading }: { rows: SubmissionRow[]; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
      <div className="px-5 md:px-6 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <p className="font-display font-bold text-[var(--bg-dark)]">Your submissions</p>
        {rows.length > 0 && <span className="text-xs text-[var(--muted)]">{rows.length} total</span>}
      </div>

      {loading ? (
        <ul className="divide-y divide-[var(--border)]">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="px-5 md:px-6 py-4 animate-pulse">
              <span className="block h-4 w-48 rounded bg-[var(--bg-cream)]" />
              <span className="mt-2 block h-3 w-28 rounded bg-[var(--bg-cream)]" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <p className="p-6 text-sm text-[var(--muted)]">Nothing submitted yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] max-h-[640px] overflow-y-auto">
          {rows.map((s) => (
            <li key={s.id} className="px-5 md:px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-[var(--bg-dark)]">{s.event_label}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {categoryLabel(s.category)} · {formatDay(s.occurred_on)} ·{" "}
                    <a
                      href={evidenceUrl(s.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-[var(--gold-deep)]"
                    >
                      photo
                    </a>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold tabular-nums text-[var(--bg-dark)]">+{s.points}</span>
                  <SubmissionStatusBadge status={s.status} />
                </div>
              </div>
              {s.note && <p className="mt-2 text-xs text-[var(--muted)]">{s.note}</p>}
              {s.review_note && (
                <p className={`mt-2 text-xs ${s.status === "rejected" ? "text-red-700" : "text-[var(--muted)]"}`}>
                  Exec: {s.review_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
