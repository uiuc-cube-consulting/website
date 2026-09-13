"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { MAX_NOTE, categoryLabel, type SubmissionRow, type SubmissionStatus } from "@/lib/point-catalog";
import {
  SubmissionStatusBadge,
  evidenceUrl,
  formatDay,
  type SubmissionsResponse,
} from "@/components/portal/PointSubmissions";

const TABS: { status: SubmissionStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "approved", label: "Approved" },
  { status: "rejected", label: "Rejected" },
];

const ROLE_LABELS: Record<string, string> = {
  project_manager: "PM",
  senior_consultant: "SC",
  returning_member: "Returning member",
  member: "New member",
};

/** Exec's review queue. The page and the API both refuse anyone else. */
export function PointReviewQueue() {
  const [data, setData] = useState<SubmissionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SubmissionStatus>("pending");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/points/submissions", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Failed to load (${r.status})`);
      setData(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<SubmissionStatus, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inTab = rows.filter((r) => r.status === tab);
    // Oldest first while pending, so the queue is worked in the order it arrived.
    if (tab === "pending") inTab.reverse();
    if (!q) return inTab;
    return inTab.filter((r) =>
      [r.member_name, r.member_email, r.event_label].some((v) => v?.toLowerCase().includes(q))
    );
  }, [rows, tab, query]);

  return (
    <div className="space-y-5">
      {data?.tableMissing && (
        <p className="rounded-xl px-4 py-3 text-sm text-amber-800 bg-amber-50 border border-amber-200">
          The submissions table doesn&rsquo;t exist yet. Run <code>db/point-submissions.sql</code> in Supabase.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Submission status" className="flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = tab === t.status;
            return (
              <button
                key={t.status}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.status)}
                className={`rounded-full px-4 py-1.5 text-sm border transition-colors inline-flex items-center gap-2 ${
                  active
                    ? "bg-[var(--bg-dark)] text-white border-[var(--bg-dark)]"
                    : "bg-white border-[var(--border)] text-[var(--bg-dark)] hover:border-[var(--gold)]"
                }`}
              >
                {t.label}
                <span className={`tabular-nums text-xs ${active ? "text-white/70" : "text-[var(--muted)]"}`}>
                  {counts[t.status]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search member or event…"
            className="w-full pl-9 pr-4 py-2 rounded-full border border-[var(--border)] bg-white text-sm focus:outline-none focus:border-[var(--gold)]"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {data === null && !error ? (
        <p className="text-sm text-[var(--muted)] inline-flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading submissions…
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--muted)]">
          {query ? "No submissions match your search." : tab === "pending" ? "Nothing waiting for review." : `No ${tab} submissions yet.`}
        </p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((s) => (
            <ReviewCard key={s.id} submission={s} onReviewed={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ReviewCard({ submission: s, onReviewed }: { submission: SubmissionRow; onReviewed: () => Promise<void> }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function review(decision: "approve" | "reject") {
    if (decision === "reject" && !note.trim()) {
      setErr("Add a note so the member knows why.");
      return;
    }
    setBusy(decision);
    setErr(null);
    try {
      const r = await fetch(`/api/points/submissions/${s.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: note.trim() || null }),
      });
      const j: { error?: string } = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Couldn't save the review (${r.status}).`);
      await onReviewed();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the review.");
    } finally {
      setBusy(null);
    }
  }

  const who = s.member_name || s.member_email || "Unknown member";
  const role = s.member_role ? ROLE_LABELS[s.member_role] ?? s.member_role : null;

  return (
    <li className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden flex flex-col">
      <a
        href={evidenceUrl(s.id)}
        target="_blank"
        rel="noreferrer"
        className="block bg-[var(--bg-cream)]"
        title="Open the full-size photo"
      >
        {/* Served by our own auth-checked route; next/image can't proxy it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={evidenceUrl(s.id)}
          alt={`Photo ${who} submitted for ${s.event_label}`}
          loading="lazy"
          className="w-full aspect-[4/3] object-cover"
        />
      </a>

      <div className="p-5 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display font-bold text-[var(--bg-dark)] truncate">{who}</p>
            <p className="text-xs text-[var(--muted)] truncate">
              {[role, s.member_email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <SubmissionStatusBadge status={s.status} />
        </div>

        <div>
          <p className="text-sm text-[var(--bg-dark)]">
            <span className="font-medium">{s.event_label}</span>{" "}
            <span className="text-[var(--muted)]">· {categoryLabel(s.category)}</span>
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Event on {formatDay(s.occurred_on)} · submitted {formatDay(s.created_at)} ·{" "}
            <span className="font-semibold text-[var(--bg-dark)]">+{s.points}</span>
          </p>
        </div>

        {s.note && (
          <p className="text-sm text-[var(--muted)] border-l-2 border-[var(--border)] pl-3">{s.note}</p>
        )}

        {s.status !== "pending" ? (
          <p className="mt-auto text-xs text-[var(--muted)]">
            {s.status === "approved" ? "Approved" : "Rejected"}
            {s.reviewer_name && ` by ${s.reviewer_name}`}
            {s.reviewed_at && ` · ${formatDay(s.reviewed_at)}`}
            {s.review_note && <span className="block mt-1">&ldquo;{s.review_note}&rdquo;</span>}
          </p>
        ) : (
          <div className="mt-auto space-y-2">
            {rejecting && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={MAX_NOTE}
                placeholder="Why it's being rejected (the member sees this)"
                aria-label="Rejection note"
                className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--gold)]"
              />
            )}
            {err && (
              <p role="alert" className="text-xs text-red-700">
                {err}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {!rejecting ? (
                <>
                  <button
                    onClick={() => void review("approve")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 text-white text-sm px-4 py-1.5 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === "approve" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Approve +{s.points}
                  </button>
                  <button
                    onClick={() => {
                      setRejecting(true);
                      setErr(null);
                    }}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] text-red-700 text-sm px-4 py-1.5 hover:bg-red-50 disabled:opacity-50"
                  >
                    <X size={14} /> Reject
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => void review("reject")}
                    disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-600 text-white text-sm px-4 py-1.5 hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy === "reject" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    Confirm reject
                  </button>
                  <button
                    onClick={() => {
                      setRejecting(false);
                      setNote("");
                      setErr(null);
                    }}
                    className="text-sm text-[var(--muted)] hover:text-[var(--bg-dark)] px-2"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
