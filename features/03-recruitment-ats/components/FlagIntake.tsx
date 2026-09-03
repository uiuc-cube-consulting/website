"use client";

// File a red/green flag on ANYONE, by email, at any time — the surface for the
// weeks between cycles when the recruiting console is closed but info nights,
// callouts and coffee chats are happening.
//
// A flag filed here waits in the pending pool until an application arrives from
// the same address, then attaches itself to that candidate's profile carrying
// its original author, note, event and date. Nothing has to be re-entered, and
// nobody has to remember in November what they noticed in August.

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeSubject, type Flag } from "@/features/03-recruitment-ats/lib/types";

type PendingResponse = { flags: Flag[]; demo: boolean; viewer: string };

function when(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function FlagIntake() {
  const [pending, setPending] = useState<Flag[]>([]);
  const [viewer, setViewer] = useState("");
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [color, setColor] = useState<"red" | "green">("green");
  const [subjectEmail, setSubjectEmail] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [event, setEvent] = useState("");
  const [description, setDescription] = useState("");
  // Anonymous unless the submitter says otherwise. The default is the whole
  // point: a red flag people are afraid to put their name to is a red flag that
  // never gets filed.
  const [attributed, setAttributed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/recruitment/flags");
      const res: PendingResponse & { error?: string } = await r.json();
      if (!r.ok) {
        setError(res.error || "Could not load pending flags.");
        return;
      }
      setPending(res.flags ?? []);
      setViewer(res.viewer ?? "");
      setDemo(Boolean(res.demo));
      setError(null);
    } catch {
      setError("Could not load pending flags.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // Events already used, offered as autocomplete. Typed freely, but suggesting
  // the existing spellings is what keeps "Fall Info Night" from also becoming
  // "fall info night" and "Info night" in the same week.
  const knownEvents = useMemo(
    () => [...new Set(pending.map((f) => f.event).filter((e): e is string => Boolean(e)))].sort(),
    [pending]
  );

  // The API refuses a flag on yourself (403). Catching it here too is the same
  // principle lib/access.ts states: the UI hides what the API would refuse, so
  // the refusal is never a surprise at submit time.
  const isSelf = Boolean(viewer) && normalizeSubject(subjectEmail) === normalizeSubject(viewer);

  // Warn before filing a second flag on someone this member has already flagged
  // in the pending pool — usually a double-submit, occasionally deliberate.
  const alreadyFiled = useMemo(() => {
    const key = normalizeSubject(subjectEmail);
    if (!key) return [];
    return pending.filter((f) => normalizeSubject(f.subject_email) === key);
  }, [pending, subjectEmail]);

  async function submit() {
    if (!subjectEmail.trim() || !description.trim()) return;
    setBusy(true);
    setToast(null);
    try {
      const r = await fetch("/api/recruitment/flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_email: subjectEmail.trim(),
          subject_name: subjectName.trim() || undefined,
          event: event.trim() || undefined,
          color,
          description: description.trim(),
          attributed,
        }),
      });
      const res = await r.json();
      if (res.ok) {
        // `linked` is only returned to exec (see the flags route: reporting it to
        // everyone else leaks the final-round roster). The fallback wording is
        // therefore the one most members see, and has to be true whether or not
        // the flag actually linked — hence "now ... or whenever they do" rather
        // than the old "if they apply", which read as "it has not attached yet".
        setToast({
          kind: "ok",
          text:
            (res.attributionUnavailable
              ? "Filed anonymously — this deployment can't record names on flags yet. "
              : "") +
            (res.linked === true
              ? "Flag recorded — this person has already applied, so it's on their profile now."
              : "Flag recorded. It attaches to their application automatically — now if they've already applied, or whenever they do."),
        });
        setSubjectEmail("");
        setSubjectName("");
        setDescription("");
        setAttributed(false);
        // `event` is deliberately kept: you are usually filing several in a row
        // straight after the same info night.
        await load();
      } else {
        setToast({ kind: "err", text: res.message || res.error || "Could not submit flag." });
      }
    } catch {
      setToast({ kind: "err", text: "Could not submit flag." });
    } finally {
      setBusy(false);
    }
  }

  const mine = pending.filter((f) => f.submitter_email?.toLowerCase() === viewer);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* ── Compose ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 lg:col-span-2">
        <p className="eyebrow">Flag someone</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Anyone, any time — they don&apos;t need to have applied. Use the email they&apos;d apply with.
        </p>

        {demo && (
          <div className="mt-4 rounded-xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-4 py-2.5 text-xs text-[var(--bg-dark)]">
            Demo data — Supabase isn&apos;t configured, so nothing here is saved.
          </div>
        )}

        <div className="mt-4 flex gap-1.5">
          <button
            type="button"
            onClick={() => setColor("green")}
            aria-pressed={color === "green"}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${color === "green" ? "border-green-300 bg-green-100 text-green-700" : "border-[var(--border)] bg-white text-[var(--bg-dark)]"}`}
          >
            Green flag
          </button>
          <button
            type="button"
            onClick={() => setColor("red")}
            aria-pressed={color === "red"}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${color === "red" ? "border-red-300 bg-red-100 text-red-700" : "border-[var(--border)] bg-white text-[var(--bg-dark)]"}`}
          >
            Red flag
          </button>
        </div>

        <label className="mt-4 block text-xs font-semibold text-[var(--muted)]" htmlFor="flag-email">
          Their email <span className="font-normal">(required — this is the match key)</span>
        </label>
        <input
          id="flag-email"
          type="email"
          value={subjectEmail}
          onChange={(e) => setSubjectEmail(e.target.value)}
          placeholder="netid@illinois.edu"
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-[var(--muted)]" htmlFor="flag-name">
              Their name <span className="font-normal">(optional)</span>
            </label>
            <input
              id="flag-name"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="So the list is readable"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--muted)]" htmlFor="flag-event">
              Event <span className="font-normal">(optional)</span>
            </label>
            <input
              id="flag-event"
              list="flag-events"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="Fall Info Night"
              className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
            />
            <datalist id="flag-events">
              {knownEvents.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>
        </div>

        <label className="mt-3 block text-xs font-semibold text-[var(--muted)]" htmlFor="flag-note">
          What happened? <span className="font-normal">(required)</span>
        </label>
        <textarea
          id="flag-note"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Specific and observable — this is read months later by someone who wasn't there."
          className="mt-1 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
        />

        {isSelf && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
            That&apos;s your own address — you can&apos;t flag yourself.
          </p>
        )}

        {!isSelf && alreadyFiled.length > 0 && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
            {alreadyFiled.length} flag{alreadyFiled.length === 1 ? "" : "s"} already pending on this
            email{alreadyFiled.some((f) => f.submitter_email?.toLowerCase() === viewer) ? ", including one of yours" : ""}. Filing another is fine — they stack.
          </p>
        )}

      <label className="mt-3 flex items-start gap-2 text-xs text-[var(--muted)]">
        <input
          type="checkbox"
          checked={attributed}
          onChange={(e) => setAttributed(e.target.checked)}
          className="mt-0.5 accent-[var(--gold)]"
        />
        <span>
          Show my name on this flag. Off by default — flags are anonymous, so you can raise
          something without it being attached to you.
        </span>
      </label>

        <button
          onClick={submit}
          disabled={busy || isSelf || !subjectEmail.trim() || !description.trim()}
          className="btn btn-gold-outline mt-3 px-4 py-2 text-xs disabled:opacity-50"
        >
          {busy ? "Submitting…" : "Submit flag"}
        </button>
        {toast && (
          <p className={`mt-2 text-sm ${toast.kind === "ok" ? "text-green-700" : "text-[var(--gold-deep)]"}`}>
            {toast.text}
          </p>
        )}
      </div>

      {/* ── Pending pool ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-[var(--border)] bg-white p-5 lg:col-span-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="eyebrow">Waiting on an application</p>
          <p className="text-xs text-[var(--muted)]">
            {pending.length} pending · {mine.length} yours
          </p>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          These attach themselves the moment an application arrives from the same address, and drop
          off this list once they do.
        </p>

        {error && <p className="mt-4 text-sm text-[var(--gold-deep)]">{error}</p>}

        {loading ? (
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-[var(--bg-cream)]" />
        ) : pending.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-white/60 px-5 py-10 text-center text-sm text-[var(--muted)]">
            Nothing pending. Flags filed here show up until the person applies.
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {pending.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-cream)]/40 px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${f.color === "red" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                  >
                    {f.color === "red" ? "Red" : "Green"}
                  </span>
                  <span className="font-semibold text-[var(--bg-dark)]">
                    {f.subject_name || f.subject_email}
                  </span>
                  {f.subject_name && (
                    <span className="text-[11px] text-[var(--muted)]">{f.subject_email}</span>
                  )}
                  {f.event && (
                    <span className="rounded-full border border-[var(--border)] bg-white px-2 py-0.5 text-[11px] text-[var(--muted)]">
                      {f.event}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[var(--bg-dark)]">{f.description}</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  — {f.submitter_email ? (f.submitter_email === viewer ? "you" : f.submitter_email) : "anonymous"} ·{" "}
                  {when(f.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
