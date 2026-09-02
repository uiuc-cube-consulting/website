"use client";

// Search-first interviewer console, scoped to ONE ROUND. Type a name, get that
// candidate's resume and both rubrics on one screen.
//
// The round is the top-level control, because the two rounds are different jobs
// with different rooms: the first round is staffed from the whole recruiting pool,
// the final round is exec and nobody else. Switching rounds refetches rather than
// filtering client-side — a non-exec never receives final-round data at all, so
// there is nothing in the browser to filter.
//
// Within a round, the whole (small) cohort is fetched once and filtered in the
// browser, so search responds on the keystroke instead of waiting on a request per
// character.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KIND_LABEL,
  ROUND_KINDS,
  isComplete,
  panelStanding,
  formatScore,
  type Candidate,
  type InterviewBoard,
} from "@/features/03-recruitment-ats/lib/interview";
import { ROUND_BLURB, ROUND_LABEL, type InterviewRound } from "@/features/03-recruitment-ats/lib/rounds";
import { CandidateWorkspace } from "./CandidateWorkspace";
import { FlagBadge } from "@/features/03-recruitment-ats/components/FlagBadge";

type Scope = "mine" | "all";

/**
 * Rank a candidate against the query. Higher is better; -1 means "don't show".
 * Full-name prefix beats a first/last-name prefix, which beats a loose substring —
 * so typing "jo" puts Jordan above someone whose email merely contains "jo".
 */
function rank(c: Candidate, q: string): number {
  const name = c.name.toLowerCase();
  const email = c.email.toLowerCase();
  if (name.startsWith(q)) return 3;
  if (name.split(/\s+/).some((t) => t.startsWith(q))) return 2;
  if (email.startsWith(q)) return 2;
  if (name.includes(q) || email.includes(q)) return 1;
  return -1;
}

export function InterviewConsole() {
  const [data, setData] = useState<InterviewBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("mine");
  const [round, setRound] = useState<InterviewRound>("first_round");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/recruitment/interview?round=${round}`, { cache: "no-store" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Failed (${r.status})`);
      const board: InterviewBoard = await r.json();
      setData(board);
      // Land on the queue that actually has something in it.
      if (!board.candidates.some((c) => c.assignedToMe)) setScope("all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [round]);

  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  /**
   * Switch rounds, clearing what belonged to the old one.
   *
   * The reset lives in the handler rather than in an effect on `round`. A
   * candidate selected in one round is not in the other, so leaving `selectedId`
   * set would keep a stale workspace on screen until the fetch landed — but doing
   * the clearing in an effect means a second render pass every time, and React
   * (rightly) warns about setState in an effect body. Switching rounds is an
   * event; treat it as one.
   */
  function switchRound(next: InterviewRound) {
    if (next === round) return;
    setSelectedId(null);
    setError(null);
    setData(null);
    setQuery("");
    setRound(next);
  }

  const mineCount = data?.candidates.filter((c) => c.assignedToMe).length ?? 0;

  const results = useMemo(() => {
    if (!data) return [];
    const pool = scope === "mine" ? data.candidates.filter((c) => c.assignedToMe) : data.candidates;
    const q = query.trim().toLowerCase();
    if (!q) return pool;
    return pool
      .map((c) => ({ c, r: rank(c, q) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => b.r - a.r || a.c.name.localeCompare(b.c.name))
      .map((x) => x.c);
  }, [data, scope, query]);

  const selected = useMemo(
    () => data?.candidates.find((c) => c.id === selectedId) ?? null,
    [data, selectedId]
  );

  if (error) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-16 text-center">
        <p className="font-display text-xl font-bold text-[var(--bg-dark)]">Couldn&rsquo;t load interviews</p>
        <p className="mx-auto mt-2 max-w-md text-[var(--muted)]">{error}</p>
      </div>
    );
  }
  if (!data) return <div className="h-80 animate-pulse rounded-2xl bg-[var(--bg-cream)]" />;

  if (selected) {
    return (
      <CandidateWorkspace
        candidate={selected}
        round={data.round}
        canManage={data.canManage}
        pool={data.pool}
        demo={data.demo}
        onBack={() => setSelectedId(null)}
        onChanged={reload}
      />
    );
  }

  return (
    <div className="space-y-5">
      {data.demo && (
        <div className="rounded-2xl border border-[var(--gold)]/35 bg-[var(--gold)]/10 px-5 py-3 text-sm text-[var(--bg-dark)]">
          <span className="font-semibold">Demo data.</span> Configure Supabase and run
          <code className="mx-1 rounded bg-white/70 px-1">db/interview.sql</code> then
          <code className="mx-1 rounded bg-white/70 px-1">db/rounds.sql</code> to store real panels,
          resumes, and rubrics. Writes are disabled in demo mode.
        </div>
      )}

      <RoundSwitcher round={data.round} available={data.availableRounds} onChange={switchRound} />

      {/* Folders are a FIRST-ROUND artifact: a resume plus the two rubric docs,
          created for the people actually being interviewed. Provisioning the
          written pool would be hundreds of folders nobody opens. */}
      {data.canManage && data.round === "first_round" && <FolderProvisionBar onProvisioned={reload} />}
      {data.canManage && data.round === "first_round" && <ResumeSyncBar onSynced={reload} />}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results.length > 0) setSelectedId(results[0].id);
            if (e.key === "Escape") setQuery("");
          }}
          autoFocus
          placeholder={`Search the ${ROUND_LABEL[data.round].toLowerCase()} by name…`}
          className="w-full max-w-md rounded-full border border-[var(--border)] bg-white px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
        />
        <div className="inline-flex overflow-hidden rounded-full border border-[var(--border)]">
          <button
            onClick={() => setScope("mine")}
            className={`px-4 py-1.5 text-sm font-medium ${scope === "mine" ? "bg-[var(--gold)] text-[var(--bg-dark)]" : "bg-white text-[var(--bg-dark)]"}`}
          >
            My interviews ({mineCount})
          </button>
          <button
            onClick={() => setScope("all")}
            className={`px-4 py-1.5 text-sm font-medium ${scope === "all" ? "bg-[var(--gold)] text-[var(--bg-dark)]" : "bg-white text-[var(--bg-dark)]"}`}
          >
            All ({data.candidates.length})
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-[var(--border)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          <span>Candidate</span>
          <span>Resume</span>
          <span className="text-right">Score</span>
          <span>Your rubrics</span>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {results.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-[var(--muted)]">
              {query.trim()
                ? `No candidate matches “${query.trim()}”.`
                : scope === "mine"
                  ? "No interviews assigned to you in this round — an exec assigns panels."
                  : `Nobody is in the ${ROUND_LABEL[data.round].toLowerCase()} yet. Exec advances candidates into it from the decision queue.`}
            </li>
          )}
          {results.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className="grid w-full grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-cream)]/40"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-medium text-[var(--bg-dark)]">
                    <span className="truncate">{c.name}</span>
                    <FlagBadge flags={c.flags} />
                    {c.assignedToMe && <span className="shrink-0 text-[11px] text-[var(--gold-deep)]">yours</span>}
                  </span>
                  <span className="block truncate text-[12px] text-[var(--muted)]">
                    {[c.year, c.major].filter(Boolean).join(" · ") || c.email}
                  </span>
                </span>
                <span className={`text-xs font-semibold ${c.resume ? "text-[var(--gold-deep)]" : "text-[var(--muted)]"}`}>
                  {c.resume ? "✓" : "—"}
                </span>
                {(() => {
                  const st = panelStanding(c.panelScores, ROUND_KINDS[data.round]);
                  if (st.submissions === 0) {
                    return <span className="text-right text-xs text-[var(--muted)]">—</span>;
                  }
                  return (
                    <span
                      className="text-right"
                      title={st.perKind
                        .map((p) => `${KIND_LABEL[p.kind]}: ${p.mean === null ? "not scored" : `${formatScore(p.mean)} / ${p.max}`}${p.n > 1 ? ` (mean of ${p.n})` : ""}`)
                        .join("\n")}
                    >
                      <span className="block text-sm font-semibold text-[var(--bg-dark)]">
                        {st.total === null ? "partial" : `${formatScore(st.total)} / ${st.max}`}
                      </span>
                      <span className="block text-[11px] text-[var(--muted)]">
                        {st.perKind
                          .map((p) => `${KIND_LABEL[p.kind][0]} ${p.mean === null ? "—" : formatScore(p.mean)}`)
                          .join(" · ")}
                      </span>
                    </span>
                  );
                })()}
                <span className="flex gap-1.5">
                  {ROUND_KINDS[data.round].map((k) => {
                    const entry = c.myRubrics[k];
                    const done = entry && isComplete(k, entry.scores);
                    return (
                      <span
                        key={k}
                        title={`${KIND_LABEL[k]} rubric${done ? " — submitted" : " — not started"}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          done ? "bg-[var(--gold)]/25 text-[var(--gold-deep)]" : "bg-[var(--bg-cream)] text-[var(--muted)]"
                        }`}
                      >
                        {KIND_LABEL[k][0]}
                      </span>
                    );
                  })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Round switcher ───────────────────────────────────────────────────────────

/**
 * Which round the console is showing.
 *
 * `available` comes from the server, not from a role check here. A non-exec is
 * never offered the final round because the API never lists it for them — the tab
 * and the data have exactly one source of truth, so hiding the control and
 * refusing the request cannot drift apart.
 */
function RoundSwitcher({
  round,
  available,
  onChange,
}: {
  round: InterviewRound;
  available: InterviewRound[];
  onChange: (r: InterviewRound) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        {available.map((r) => (
          <button
            key={r}
            onClick={() => onChange(r)}
            className={
              "rounded-full px-4 py-2 text-xs font-semibold transition " +
              (round === r
                ? "bg-[var(--gold)] text-[var(--bg-dark)]"
                : "border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--bg-cream)]/50")
            }
          >
            {ROUND_LABEL[r]}
            {r === "final_round" && <span className="ml-1.5 opacity-70">· exec</span>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">{ROUND_BLURB[round]}</p>
    </div>
  );
}

// ── Drive folder provisioning (exec) ─────────────────────────────────────────
// Reads the Google Form response sheet and gives every candidate a Drive folder
// holding their resume, both rubrics, and a notes doc. Distinct from the resume
// sync below: this one WRITES to Drive, and its resume mapping comes straight
// from the Form rather than from filename matching.

type ProvisionResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  cycle?: string;
  candidates?: number;
  foldersCreated?: number;
  assetsCreated?: number;
  unchanged?: number;
  remaining?: number;
  noResume?: { name: string; email: string }[];
  failed?: { name: string; email: string; error: string }[];
};

function FolderProvisionBar({ onProvisioned }: { onProvisioned: () => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [repair, setRepair] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResponse | null>(null);

  /**
   * One click, however big the cohort. The server provisions a bounded batch per
   * request (a serverless function cannot hold ~8s x 100 candidates), so we keep
   * calling while it reports work left. Each call is idempotent, so a failure
   * part-way just means the next click resumes rather than repeats.
   */
  async function provision() {
    setBusy(true);
    setResult(null);
    setProgress(null);

    const total = { folders: 0, assets: 0 };
    try {
      for (let pass = 0; pass < 50; pass++) {
        const r = await fetch("/api/recruitment/folders/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ repair }),
        });
        const res: ProvisionResponse = await r.json();
        if (!res.ok) {
          setResult(res);
          return;
        }
        total.folders += res.foldersCreated ?? 0;
        total.assets += res.assetsCreated ?? 0;

        if (!res.remaining) {
          setResult({ ...res, foldersCreated: total.folders, assetsCreated: total.assets });
          await onProvisioned();
          return;
        }
        setProgress(`${total.folders} folder(s) done · ${res.remaining} candidate(s) to go…`);
      }
      // 50 batches is far more than any real cycle; treat it as a runaway.
      setResult({ ok: false, error: "Stopped after 50 batches. Re-run to continue." });
    } catch {
      setResult({ ok: false, error: "Provisioning failed — re-run to resume where it stopped." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={provision} disabled={busy} className="btn btn-gold text-xs px-4 py-2 disabled:opacity-50">
          {busy ? "Provisioning…" : "Provision candidate folders"}
        </button>
        <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            checked={repair}
            onChange={(e) => setRepair(e.target.checked)}
            className="accent-[var(--gold)]"
          />
          Repair mode
        </label>
        <span className="text-xs text-[var(--muted)]">
          {progress ?? "Creates a Drive folder per candidate with their resume, both rubrics, and a notes doc. Safe to re-run — only what's missing is created."}
        </span>
      </div>

      {result && (
        <div className="mt-3 text-sm">
          {result.ok ? (
            <>
              <p className="text-[var(--bg-dark)]">
                <span className="font-semibold">{result.cycle}</span> ·{" "}
                <span className="font-semibold">{result.candidates}</span> candidate(s) ·{" "}
                <span className="font-semibold">{result.foldersCreated}</span> folder(s) created ·{" "}
                <span className="font-semibold">{result.assetsCreated}</span> file(s) created
                {result.unchanged ? <> · {result.unchanged} already complete</> : null}
              </p>
              {result.noResume && result.noResume.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">
                    {result.noResume.length} candidate(s) haven&rsquo;t uploaded a resume
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--muted)]">
                    {result.noResume.map((m) => (
                      <li key={m.email}>
                        {m.name} <span className="opacity-70">({m.email})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {result.failed && result.failed.length > 0 && (
                <details className="mt-2" open>
                  <summary className="cursor-pointer text-xs font-semibold text-amber-700">
                    {result.failed.length} candidate(s) had errors — re-run to retry
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--muted)]">
                    {result.failed.map((f) => (
                      <li key={f.email}>
                        {f.name} <span className="opacity-70">— {f.error}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="text-amber-700">{result.message || result.error || "Provisioning failed."}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Resume sync (exec) ───────────────────────────────────────────────────────

type SyncResponse = {
  ok: boolean;
  message?: string;
  error?: string;
  scanned?: number;
  linked?: number;
  fuzzy?: number;
  unmatched?: { name: string; reason: string }[];
  missing?: { id: string; name: string; email: string }[];
};

function ResumeSyncBar({ onSynced }: { onSynced: () => Promise<void> | void }) {
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);

  async function sync() {
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/recruitment/resumes/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: folder.trim() || undefined }),
      });
      const res: SyncResponse = await r.json();
      setResult(res);
      if (res.ok) await onSynced();
    } catch {
      setResult({ ok: false, error: "Sync failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="Drive resume folder URL (or leave blank to use the configured one)"
          className="w-96 max-w-full rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold)]"
        />
        <button onClick={sync} disabled={busy} className="btn btn-gold text-xs px-4 py-2 disabled:opacity-50">
          {busy ? "Scanning…" : "Sync resumes"}
        </button>
        <span className="text-xs text-[var(--muted)]">
          Matches every file in the folder to a candidate. Safe to re-run.
        </span>
      </div>

      {result && (
        <div className="mt-3 text-sm">
          {result.ok ? (
            <>
              <p className="text-[var(--bg-dark)]">
                Scanned <span className="font-semibold">{result.scanned}</span> file(s) ·
                linked <span className="font-semibold">{result.linked}</span>
                {result.fuzzy ? <> · {result.fuzzy} by name similarity</> : null}
              </p>
              {result.unmatched && result.unmatched.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-amber-700">
                    {result.unmatched.length} file(s) couldn&rsquo;t be matched — rename in Drive and re-run
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--muted)]">
                    {result.unmatched.map((u, i) => (
                      <li key={`${u.name}-${i}`}>
                        {u.name} <span className="opacity-70">({u.reason})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {result.missing && result.missing.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--muted)]">
                    {result.missing.length} candidate(s) still have no resume
                  </summary>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-[var(--muted)]">
                    {result.missing.map((m) => (
                      <li key={m.id}>
                        {m.name} <span className="opacity-70">({m.email})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <p className="text-amber-700">{result.message || result.error || "Sync failed."}</p>
          )}
        </div>
      )}
    </div>
  );
}
