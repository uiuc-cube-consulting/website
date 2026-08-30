// Server-only data access for the ATS. Uses Supabase when configured, otherwise
// falls back to demo data for reads (and reports demo mode for writes). Never import
// from client code.

import { createServerClient } from "@/lib/supabase/server";
import { DEMO_APPLICANTS, DEMO_FLAGS, DEMO_PENDING_FLAGS, DEMO_REVIEWS } from "./demo";
import {
  normalizeSubject,
  partitionFlags,
  planAssignments,
  screenTotal,
  type Applicant,
  type Assignment,
  type Flag,
  type Review,
  type Scores,
  type Stage,
} from "./types";

// Members who can be assigned as recruitment reviewers (matches proxy.ts).
// Canonical list lives in ./access.ts so the gate and the pool can never diverge.
import { RECRUITING_ROLES } from "./access";
import { cycleForDate, cyclesPresent, inCycle, normalizeCycle } from "./cycle";
import { linkFormResumes } from "./interview-store";
import {
  computeCoverage,
  resolveReviewerPool,
  validateReassignment,
  MIN_REVIEWERS_PER_APPLICANT,
  type Coverage,
  type ReassignInput,
} from "./assignment";
const REVIEWER_ROLES = [...RECRUITING_ROLES];
// Applicant stages that no longer need review.
const TERMINAL_STAGES = ["rejected", "withdrawn", "accepted"];

// Reuses the shared Supabase client from the strike_system foundation
// (lib/supabase/server.ts) — we do NOT define our own client. Returns null when
// Supabase env is absent → the ATS runs on demo data.
function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

export type Snapshot = {
  applicants: Applicant[];
  reviews: Review[];
  /** Flags attached to an applicant. */
  flags: Flag[];
  /** Flags filed against an email that has not applied yet. */
  pendingFlags: Flag[];
  demo: boolean;
};

/**
 * Everything the console renders, for ONE recruiting cycle.
 *
 * `cycle` is optional only so a caller can deliberately ask for the whole
 * history; every user-facing path passes one. Mixing cohorts is not a display
 * preference — a funnel counting fa26 and sp27 together, or a mean spanning two
 * different applications from the same person, is a number that describes
 * nothing. Callers resolve the cycle with `resolveCycle`/`getActiveCycle`
 * (lib/visibility.ts).
 *
 * The applicants query is narrowed in the database (indexed on `cycle`), while
 * reviews and flags are narrowed in memory against the resulting id set. That
 * keeps the three reads parallel: scoping reviews server-side would need the
 * applicant ids first, turning one round trip into two on the request that runs
 * on every dashboard load. At club scale — hundreds of applications a cycle,
 * two or three reviews each — the rows filtered out here are cheap; revisit if
 * `reviews` ever gets large enough for the transfer to matter.
 */
export async function getSnapshot(cycle?: string): Promise<Snapshot> {
  const want = normalizeCycle(cycle);
  const sb = db();
  if (!sb) {
    const applicants = inCycle(DEMO_APPLICANTS, want);
    const ids = new Set(applicants.map((a) => a.id));
    return {
      applicants,
      reviews: DEMO_REVIEWS.filter((r) => ids.has(r.applicant_id)),
      flags: DEMO_FLAGS.filter((f) => f.applicant_id && ids.has(f.applicant_id)),
      // Pending flags are deliberately NOT cycle-scoped: they are filed against
      // an email before any application exists, so they belong to no cohort
      // until one claims them.
      pendingFlags: DEMO_PENDING_FLAGS,
      demo: true,
    };
  }

  const applicantQuery = sb.from("applicants").select("*").order("created_at", { ascending: false });
  if (want) applicantQuery.eq("cycle", want);

  const [{ data: applicants, error: aErr }, { data: reviews, error: rErr }, { data: flags, error: fErr }] =
    await Promise.all([
      applicantQuery,
      sb.from("reviews").select("*"),
      sb.from("applicant_flags").select("*").order("created_at", { ascending: false }),
    ]);
  if (aErr) throw aErr;
  if (rErr) throw rErr;
  if (fErr) throw fErr;

  const rows = (applicants ?? []) as Applicant[];
  const ids = new Set(rows.map((a) => a.id));
  const { linked, pending } = partitionFlags((flags ?? []) as Flag[]);
  return {
    applicants: rows,
    reviews: want ? ((reviews ?? []) as Review[]).filter((r) => ids.has(r.applicant_id)) : ((reviews ?? []) as Review[]),
    flags: want ? linked.filter((f) => f.applicant_id && ids.has(f.applicant_id)) : linked,
    pendingFlags: pending,
    demo: false,
  };
}

/** Every flag still waiting for its applicant, newest first. */
export async function getPendingFlags(): Promise<{ flags: Flag[]; demo: boolean }> {
  const sb = db();
  if (!sb) return { flags: DEMO_PENDING_FLAGS, demo: true };
  const { data, error } = await sb
    .from("applicant_flags")
    .select("*")
    .is("applicant_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return { flags: (data ?? []) as Flag[], demo: false };
}

/**
 * Attach every pending flag filed against `email` to a newly-created applicant.
 *
 * This is the join between the two halves of the feature: members flag people at
 * events, and weeks later an application arrives from that address and silently
 * inherits everything already said about them. Called from every path that
 * creates an applicant — the public intake form and the bulk sheet import — so
 * there is no way to enter the pipeline and miss your flags.
 *
 * Failures are reported but never thrown: a flag that fails to link is a lost
 * annotation, whereas an exception here would fail the application itself. The
 * pending rows survive, so a later re-run picks them up.
 *
 * KNOWN LIMIT — one claim per person, not per application. A flag row points at
 * a single applicant, so if the same email produces two applicant rows (a
 * duplicate submission today; a second cycle once per-semester cycles land) the
 * FIRST row to be created takes the flags and the second sees none. That is
 * acceptable while duplicates are an anomaly, and stops being acceptable when
 * re-applying is normal: at that point the fix is to resolve flags by email at
 * READ time rather than claiming them at write time, since a flag is about a
 * person and not about an application.
 */
export async function claimPendingFlags(
  applicants: { id: string; email: string }[]
): Promise<{ linked: number; error?: string }> {
  const sb = db();
  if (!sb || applicants.length === 0) return { linked: 0 };

  let linked = 0;
  for (const a of applicants) {
    const key = normalizeSubject(a.email ?? "");
    if (!key) continue;
    // Emails are stored already-lowered (db/flags.sql), so this is an equality
    // match on the partial index rather than a scan with ilike.
    const { data, error } = await sb
      .from("applicant_flags")
      .update({ applicant_id: a.id, linked_at: new Date().toISOString() })
      .is("applicant_id", null)
      .eq("subject_email", key)
      .select("id");
    if (error) return { linked, error: error.message };
    linked += (data ?? []).length;
  }
  return { linked };
}

export type WriteResult = {
  ok: boolean;
  demo?: boolean;
  id?: string;
  error?: string;
  /** Pending flags this write attached to a new applicant. */
  flagsLinked?: number;
  /** This person already has an application in the cycle being written to. The
   *  candidate's own mistake to correct, not a server fault — routes answer 409
   *  rather than 500, so the intake form can say so instead of "try again". */
  duplicate?: boolean;
};

export async function createApplicant(input: {
  name: string;
  email: string;
  /** Which cycle this application joins. Callers resolve it from the active
   *  cycle (lib/visibility.ts) rather than taking it from the applicant — an
   *  applicant does not get to choose which cohort they are judged in. */
  cycle: string;
  year?: string;
  major?: string;
  college?: string;
  responses?: Record<string, string>;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  // Normalise rather than trust, and fall back to the cycle matching today
  // rather than reject. A malformed cycle would be caught by the CHECK
  // constraint and surface to a candidate as a failed submission — losing the
  // essays they just wrote over an internal formatting problem. Landing in the
  // date-derived cycle is recoverable; a lost application is not.
  const cycle = normalizeCycle(input.cycle) ?? cycleForDate();

  const { data, error } = await sb
    .from("applicants")
    .insert({
      name: input.name,
      email: input.email,
      cycle,
      year: input.year ?? null,
      major: input.major ?? null,
      college: input.college ?? null,
      responses: input.responses ?? {},
    })
    .select("id")
    .single();
  if (error) {
    // 23505 is unique_violation — here, only ever (lower(email), cycle) from
    // db/cycles.sql. Applying again in a LATER cycle is the whole point of the
    // column and is allowed; applying twice in the SAME one is not, and the
    // candidate needs to be told which of those they just did.
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        duplicate: true,
        error: "You have already applied in this recruiting cycle.",
      };
    }
    return { ok: false, error: error.message };
  }

  // Inherit anything already said about this person at an event. Deliberately
  // not awaited-and-checked into a failure: the application is saved either way.
  const claim = await claimPendingFlags([{ id: data.id, email: input.email }]);
  return { ok: true, id: data.id, flagsLinked: claim.linked };
}

/**
 * Move SEVERAL applicants to the same stage in one operation.
 *
 * Bulk rejection is the delibs-day case: exec works down a sorted queue and the
 * bottom forty are all the same call. Doing that as forty round trips is slow
 * enough that people batch it wrong — closing the tab halfway, or double-clicking
 * and losing track of which went through.
 *
 * Two writes total, not two per applicant: one `update ... in (ids)` and one
 * upsert of the decision rows. Postgres applies each statement atomically, so
 * either every stage moved or none did — there is no half-rejected cohort to
 * reconcile afterwards.
 *
 * Callers must have already removed the viewer's own application (self-access)
 * and validated the stage; this does the write, not the policy.
 */
export async function setDecisions(input: {
  applicant_ids: string[];
  stage: Stage;
  decided_by: string;
  note?: string;
}): Promise<WriteResult & { updated?: number }> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const ids = [...new Set(input.applicant_ids.filter(Boolean))];
  if (!ids.length) return { ok: true, updated: 0 };

  const { data: moved, error: uErr } = await sb
    .from("applicants")
    .update({ stage: input.stage })
    .in("id", ids)
    .select("id");
  if (uErr) return { ok: false, error: uErr.message };

  // Only ids that actually matched a row get a decision, so a stale id from a
  // browser tab that has been open a while cannot leave an orphan behind.
  const hit = (moved ?? []).map((r) => String(r.id));
  if (hit.length) {
    const decidedAt = new Date().toISOString();
    const { error: dErr } = await sb.from("decisions").upsert(
      hit.map((applicant_id) => ({
        applicant_id,
        decision: input.stage,
        decided_by: input.decided_by,
        decided_at: decidedAt,
        note: input.note ?? null,
      })),
      { onConflict: "applicant_id" }
    );
    if (dErr) return { ok: false, error: dErr.message, updated: hit.length };
  }
  return { ok: true, updated: hit.length };
}

export async function submitReview(input: {
  applicant_id: string;
  reviewer_email: string;
  scores: Scores;
  notes?: string;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };
  // `kind` is part of the conflict target, not decoration. db/interview.sql
  // DROPPED the original unique (applicant_id, reviewer_email) and replaced it
  // with (applicant_id, reviewer_email, kind), so a reviewer's case rubric cannot
  // overwrite their screen. Upserting on the old pair therefore names a
  // constraint that no longer exists, and Postgres rejects the whole statement
  // with "no unique or exclusion constraint matching the ON CONFLICT
  // specification" — which surfaced as every screen review failing to save.
  const { error } = await sb.from("reviews").upsert(
    {
      applicant_id: input.applicant_id,
      reviewer_email: input.reviewer_email,
      kind: "screen",
      scores: input.scores,
      // Points out of SCREEN_MAX_POINTS. The column keeps its historical name;
      // only interview rubrics still put a 1-5 weighted mean in it.
      weighted_total: screenTotal(input.scores),
      notes: input.notes ?? null,
    },
    { onConflict: "applicant_id,reviewer_email,kind" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Escape the LIKE metacharacters before an email is used as an `ilike` pattern.
 *
 * `_` matches any single character in LIKE and is perfectly legal in an email
 * local part, so an unescaped lookup for `first_last@illinois.edu` also matches
 * `firstXlast@illinois.edu` — silently attaching one person's flag to another.
 * `%` and the escape character itself have the same problem.
 */
function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type FlagResult = WriteResult & {
  /** True when the flag landed on an existing applicant rather than the pending
   *  pool — either because it was filed from their profile, or because the email
   *  turned out to already be in the pipeline. */
  linked?: boolean;
};

/**
 * File a red/green flag, either on an applicant we already have or on a bare
 * email address.
 *
 * Three cases, in order:
 *   1. `applicant_id` given — filed from a candidate's profile. The subject email
 *      is read from the applicant row rather than trusted from the caller, so the
 *      match key can never disagree with the person it is attached to.
 *   2. `subject_email` given and somebody has ALREADY applied from it — link it
 *      immediately. Filing "by email" during an open cycle should not silently
 *      strand the flag in a pending pool nobody reads.
 *   3. `subject_email` given and nobody has applied yet — store it PENDING. This
 *      is the event case: it waits, and `claimPendingFlags` attaches it when the
 *      application arrives.
 */
export async function submitFlag(input: {
  applicant_id?: string | null;
  subject_email?: string | null;
  subject_name?: string | null;
  event?: string | null;
  submitter_email: string;
  color: "red" | "green";
  description: string;
  /** Which cycle's application a by-email flag should attach to. Callers pass
   *  the active cycle; omitted means "the person's most recent application,
   *  whichever cycle that is". */
  cycle?: string | null;
}): Promise<FlagResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  let applicantId: string | null = input.applicant_id ?? null;
  let subject = normalizeSubject(input.subject_email ?? "");

  if (applicantId) {
    const { data, error } = await sb
      .from("applicants")
      .select("email")
      .eq("id", applicantId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Unknown applicant." };
    subject = normalizeSubject(String(data.email));
  } else {
    if (!subject) return { ok: false, error: "An email is required to flag someone." };

    // Scoped to one cycle, because a returning candidate now has several
    // applications and a flag filed today is an observation about them THIS
    // cycle — hanging it on the fa26 row that was rejected last year would bury
    // it where the people screening them now will never look.
    const cycle = normalizeCycle(input.cycle);
    const lookup = sb.from("applicants").select("id").ilike("email", likeEscape(subject));
    if (cycle) lookup.eq("cycle", cycle);

    const { data, error } = await lookup
      // Not `maybeSingle` on its own: one person legitimately holds several
      // applications across cycles, and even within one cycle the public intake
      // form does not dedupe, so a double submission produces two rows.
      // `maybeSingle` errors on more than one rather than picking. Newest wins.
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    applicantId = data?.id ?? null;
  }

  const { error } = await sb.from("applicant_flags").insert({
    applicant_id: applicantId,
    subject_email: subject,
    subject_name: input.subject_name?.trim() || null,
    event: input.event?.trim() || null,
    linked_at: applicantId ? new Date().toISOString() : null,
    submitter_email: input.submitter_email,
    color: input.color,
    description: input.description,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, linked: Boolean(applicantId) };
}

export async function setDecision(input: {
  applicant_id: string;
  stage: Stage;
  decided_by: string;
  note?: string;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };
  const { error: uErr } = await sb.from("applicants").update({ stage: input.stage }).eq("id", input.applicant_id);
  if (uErr) return { ok: false, error: uErr.message };
  const { error: dErr } = await sb.from("decisions").upsert(
    {
      applicant_id: input.applicant_id,
      decision: input.stage,
      decided_by: input.decided_by,
      note: input.note ?? null,
    },
    { onConflict: "applicant_id" }
  );
  if (dErr) return { ok: false, error: dErr.message };
  return { ok: true };
}

// ── Reviewer pool, assignments, queue ────────────────────────────────────────

/** `role` rides along so callers can narrow further — the final-round interview
 *  panel is exec-only, and the picker has to know who qualifies. */
export type Reviewer = { email: string; name?: string | null; role?: string | null };

/** The reviewer pool = members whose role can review applicants. */
export async function getReviewerPool(): Promise<Reviewer[]> {
  const sb = db();
  if (!sb) {
    // demo: distinct reviewers seen in the demo reviews
    const seen = new Map<string, Reviewer>();
    for (const r of DEMO_REVIEWS) seen.set(r.reviewer_email, { email: r.reviewer_email });
    return [...seen.values()];
  }
  const { data, error } = await sb.from("members").select("email, full_name, role").in("role", REVIEWER_ROLES);
  if (error) throw error;
  return (data ?? []).map((m) => ({ email: m.email, name: m.full_name, role: m.role }));
}

export async function getAssignments(): Promise<Assignment[]> {
  const sb = db();
  if (!sb) return [];
  const { data, error } = await sb.from("assignments").select("applicant_id, reviewer_email");
  if (error) throw error;
  return (data ?? []) as Assignment[];
}

export type AssignResult = {
  ok: boolean;
  demo?: boolean;
  error?: string;
  assigned?: number; // new assignment rows created
  applicants?: number; // active applicants considered
  reviewers?: number; // reviewer pool size actually used
  /** Submitted emails dropped because they aren't in the reviewer pool. */
  ignored?: string[];
  /** Set when the run was a full reshuffle rather than a top-up. */
  reshuffled?: boolean;
  /** Assignments torn down before re-dealing. */
  cleared?: number;
  /** Assignments kept because the reviewer had already submitted a review. */
  preserved?: number;
};

/** Randomly + evenly assign k reviewers to every active applicant (top-up aware). */
/**
 * Randomly and evenly assign k reviewers to every active applicant.
 *
 * `selected` narrows the pool to the people exec actually ticked — for the
 * common case where several of the eligible roster are away, graduated, or
 * simply not doing this cycle, and spreading applications onto them would strand
 * those reads. Omitted (or empty) means the whole eligible pool, which is the
 * original behaviour.
 *
 * The submitted list is INTERSECTED with the real pool rather than trusted. The
 * route is exec-only, but an arbitrary email would otherwise become a live
 * assignment row for somebody who cannot sign in to act on it — a review that
 * silently never arrives, which is exactly the failure coverage exists to catch.
 * Anything dropped is reported back rather than ignored.
 */
export async function assignReviewers(
  k = 2,
  selected?: string[],
  opts: { reshuffle?: boolean; cycle?: string } = {}
): Promise<AssignResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  // Scoped to one cycle, or every reviewer would be dealt last semester's
  // cohort alongside this one — hundreds of reads on applications that were
  // decided months ago, and a coverage report that can never reach done.
  const cycle = normalizeCycle(opts.cycle);
  const appQuery = sb.from("applicants").select("id, email, stage");
  if (cycle) appQuery.eq("cycle", cycle);

  const { data: apps, error: aErr } = await appQuery;
  if (aErr) return { ok: false, error: aErr.message };
  const active = (apps ?? []).filter((a) => !TERMINAL_STAGES.includes(a.stage));

  const pool = await getReviewerPool();
  let reviewerEmails = pool.map((p) => p.email);
  if (reviewerEmails.length === 0) {
    return { ok: false, error: "No reviewers found. Seed members with a reviewer role first." };
  }

  const resolved = resolveReviewerPool(reviewerEmails, selected, k);
  if (resolved.error) return { ok: false, error: resolved.error, ignored: resolved.ignored };
  reviewerEmails = resolved.emails;
  const ignored = resolved.ignored;

  let existing = await getAssignments();
  let cleared = 0;
  let preserved = 0;

  if (opts.reshuffle) {
    // A reshuffle throws away the current spread and deals again, so a pool
    // change (or a bad test run) doesn't leave half the cohort on the old
    // allocation. Only ACTIVE applicants are re-dealt; assignments on rejected
    // or withdrawn candidates are history and are left alone.
    const activeIds = active.map((a) => a.id);

    // One carve-out: a reviewer who has ALREADY SUBMITTED a review keeps that
    // applicant. `canReviewApplicant` gates editing on assignment, so dealing
    // them away would revoke their access to their own submitted work and leave
    // a review that coverage counts but no assignment backs. Work already done
    // is never reshuffled away.
    const { data: reviewed } = await sb
      .from("reviews")
      .select("applicant_id, reviewer_email")
      .in("applicant_id", activeIds.length ? activeIds : ["00000000-0000-0000-0000-000000000000"]);

    const keep = (reviewed ?? []).map((r) => ({
      applicant_id: r.applicant_id as string,
      reviewer_email: (r.reviewer_email as string).toLowerCase(),
    }));
    const keepKeys = new Set(keep.map((r) => `${r.applicant_id}:${r.reviewer_email}`));
    preserved = keepKeys.size;

    cleared = existing.filter(
      (a) =>
        activeIds.includes(a.applicant_id) &&
        !keepKeys.has(`${a.applicant_id}:${a.reviewer_email.toLowerCase()}`)
    ).length;

    if (activeIds.length) {
      const { error: delErr } = await sb.from("assignments").delete().in("applicant_id", activeIds);
      if (delErr) return { ok: false, error: delErr.message };
    }

    // Plan around the preserved pairs, so an applicant who already has one
    // submitted review gets topped up to k rather than dealt a full fresh k.
    existing = [...new Map(keep.map((r) => [`${r.applicant_id}:${r.reviewer_email}`, r])).values()];
  }

  const plan = planAssignments(
    active.map((a) => ({ id: a.id, email: a.email })),
    reviewerEmails,
    existing,
    k
  );

  // On a reshuffle the preserved pairs were deleted along with the rest, so they
  // are written back alongside the new plan.
  const toWrite = opts.reshuffle ? [...existing, ...plan] : plan;

  if (toWrite.length) {
    const { error } = await sb
      .from("assignments")
      .upsert(toWrite, { onConflict: "applicant_id,reviewer_email" });
    if (error) return { ok: false, error: error.message };
  }
  return {
    ok: true,
    assigned: plan.length,
    applicants: active.length,
    reviewers: reviewerEmails.length,
    ...(opts.reshuffle ? { reshuffled: true, cleared, preserved } : {}),
    ...(ignored.length ? { ignored } : {}),
  };
}

// ── Bulk import (from a Google Sheet of form responses) ──────────────────────

export type ImportRow = {
  name: string;
  email: string;
  year?: string;
  major?: string;
  college?: string;
  responses?: Record<string, string>;
  /** Raw contents of the Form's file-upload column, when the sheet has one.
   *  Parsed into a Drive file id by lib/form-resume.ts during provisioning. */
  resumeLink?: string;
};

export type ImportResult = {
  ok: boolean;
  demo?: boolean;
  error?: string;
  inserted?: number;
  skipped?: number;
  /** WHY each skipped row was skipped. `skipped` is the sum of these three, and
   *  on its own it cannot distinguish a typo'd address from a re-submission
   *  from a row an earlier run already imported — which is exactly the question
   *  asked when the sheet's row count and the imported count disagree. */
  skippedDetail?: {
    /** No address, or one that isn't shaped like an address. */
    invalidEmail: string[];
    /** This address appears more than once IN THE SHEET — a re-submission. */
    duplicateInSheet: string[];
    /** Already imported into this cycle. Re-running is meant to produce these. */
    alreadyInCycle: string[];
  };
  /** Which cycle the rows landed in. */
  cycle?: string;
  /** Pending event flags attached to the applicants this run created. */
  flagsLinked?: number;
  /** Applicants pointed at the resume their Form response uploaded. */
  resumesLinked?: number;
};

/**
 * Insert applicants from a Form response sheet, deduped by (email, CYCLE) —
 * against what is already stored and within the batch.
 *
 * The cycle in that key is load-bearing. This dedupe used to be on email alone,
 * which quietly made re-applying impossible: someone who applied in fa26 and
 * came back in sp27 was matched against their old row and dropped as a
 * duplicate, so their new application never entered the pipeline and nobody
 * found out — the import reported it under `skipped`, indistinguishable from a
 * genuine double-submission.
 *
 * Scoped to one cycle it means the right thing: you cannot submit twice in one
 * cycle, and every cycle starts clean. Re-running an import for the SAME cycle
 * is still idempotent, which is what makes it safe to re-run as the sheet fills.
 */
export async function importApplicants(rows: ImportRow[], cycle: string): Promise<ImportResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const target = normalizeCycle(cycle) ?? cycleForDate();

  // Only this cycle's rows can collide, so only they are fetched.
  const { data: existing, error: eErr } = await sb
    .from("applicants")
    .select("email")
    .eq("cycle", target);
  if (eErr) return { ok: false, error: eErr.message };
  const have = new Set((existing ?? []).map((e) => String(e.email).toLowerCase()));

  // Why each row was dropped, not just how many. A bare `skipped` count made
  // three very different situations indistinguishable — a malformed address, a
  // person who submitted the form twice, and a row already imported by an
  // earlier run — so "144 in the sheet, 128 imported" had no answer short of
  // reading the spreadsheet by hand. Any domain is accepted; there is no
  // allowlist, so @gmail.com and @illinois.edu are treated identically.
  const invalidEmail: string[] = [];
  const duplicateInSheet: string[] = [];
  const alreadyInCycle: string[] = [];

  const seen = new Set<string>();
  const toInsert = rows
    .filter((r) => {
      const ok = Boolean(r.email) && /.+@.+\..+/.test(r.email);
      if (!ok) invalidEmail.push(r.email || "(blank)");
      return ok;
    })
    .filter((r) => {
      const key = r.email.toLowerCase();
      if (have.has(key)) {
        alreadyInCycle.push(key);
        return false;
      }
      if (seen.has(key)) {
        duplicateInSheet.push(key);
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((r) => ({
      name: r.name || r.email,
      email: r.email,
      cycle: target,
      year: r.year ?? null,
      major: r.major ?? null,
      college: r.college ?? null,
      responses: r.responses ?? {},
    }));

  let flagsLinked = 0;
  let resumesLinked = 0;
  if (toInsert.length) {
    // `select` the ids back, because the claim below needs them. The sheet import
    // is the path most applicants actually arrive through, so skipping the claim
    // here would leave event flags stranded for almost the whole cohort.
    const { data: created, error } = await sb.from("applicants").insert(toInsert).select("id, email");
    if (error) return { ok: false, error: error.message };
    const claim = await claimPendingFlags(
      (created ?? []).map((r) => ({ id: String(r.id), email: String(r.email) }))
    );
    flagsLinked = claim.linked;

    // Point them at the resume their Form response uploaded. The written rubric
    // scores the resume out of 5, so this is not a convenience — without it the
    // readers doing the written round have no way to see the thing they are
    // scoring. Deliberately not fatal: an unreachable Drive should leave the
    // import succeeding with the essays intact, not fail the whole cohort.
    const linkByEmail = new Map(
      rows.filter((r) => r.resumeLink).map((r) => [r.email.toLowerCase(), r.resumeLink])
    );
    const link = await linkFormResumes(
      (created ?? []).map((r) => ({
        applicantId: String(r.id),
        resumeLink: linkByEmail.get(String(r.email).toLowerCase()),
      }))
    );
    resumesLinked = link.linked;
  }
  return {
    ok: true,
    inserted: toInsert.length,
    skipped: rows.length - toInsert.length,
    skippedDetail: { invalidEmail, duplicateInSheet, alreadyInCycle },
    cycle: target,
    flagsLinked,
    resumesLinked,
  };
}

// ── Coverage + manual reassignment (exec) ────────────────────────────────────

export type CoverageResult =
  | { ok: true; demo?: boolean; rows: Coverage[] }
  | { ok: false; error: string };

/**
 * Live reviewer coverage for every ACTIVE applicant. Computed from the tables
 * rather than inferred from the last assignment run, because the two drift the
 * moment an applicant arrives late or a reviewer goes quiet.
 */
export async function getCoverage(cycle?: string): Promise<CoverageResult> {
  const sb = db();
  if (!sb) return { ok: true, demo: true, rows: [] };

  // Assignments and reviews need no cycle filter of their own: they are keyed by
  // applicant_id, and `computeCoverage` only emits rows for the applicants it is
  // given, so narrowing the applicant query narrows the whole report.
  const want = normalizeCycle(cycle);
  const appQuery = sb.from("applicants").select("id, name, email, stage");
  if (want) appQuery.eq("cycle", want);

  const [appsRes, assignsRes, reviewsRes] = await Promise.all([
    appQuery,
    sb.from("assignments").select("applicant_id, reviewer_email"),
    sb.from("reviews").select("applicant_id, reviewer_email, kind"),
  ]);
  if (appsRes.error) return { ok: false, error: appsRes.error.message };
  if (assignsRes.error) return { ok: false, error: assignsRes.error.message };
  if (reviewsRes.error) return { ok: false, error: reviewsRes.error.message };

  const active = (appsRes.data ?? []).filter((a) => !TERMINAL_STAGES.includes(a.stage));
  return {
    ok: true,
    rows: computeCoverage(
      active as { id: string; name: string; email: string; stage: string }[],
      (assignsRes.data ?? []) as Assignment[],
      (reviewsRes.data ?? []) as unknown as Review[]
    ),
  };
}

export type ReassignResult =
  | { ok: true; assigned: string[] }
  | { ok: false; demo: true }
  | { ok: false; error: string };

/**
 * Exec reroutes a single candidate's reviewers: add, remove, or swap one out for
 * another. This is the delibs-day escape hatch — someone is absent, and the
 * candidate needs an eye on them now.
 *
 * Validation is shared with the client (lib/assignment.ts) so the UI refuses the
 * same things the API does, but it is re-run here against freshly read state:
 * the browser's copy of who is assigned can be minutes stale, and two execs
 * rerouting at once would otherwise race.
 */
export async function reassignReviewer(input: ReassignInput): Promise<ReassignResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const { data: applicant, error: aErr } = await sb
    .from("applicants")
    .select("id, email")
    .eq("id", input.applicant_id)
    .single();
  if (aErr || !applicant) return { ok: false, error: "Unknown applicant." };

  const { data: current, error: cErr } = await sb
    .from("assignments")
    .select("reviewer_email")
    .eq("applicant_id", input.applicant_id);
  if (cErr) return { ok: false, error: cErr.message };
  const assignees = (current ?? []).map((r) => String(r.reviewer_email));

  const pool = (await getReviewerPool()).map((p) => p.email);
  const check = validateReassignment(input, applicant as { id: string; email: string }, assignees, pool);
  if (!check.ok) return { ok: false, error: check.error };

  const to = input.to?.toLowerCase();
  const from = input.from?.toLowerCase();

  if (input.action === "remove" || input.action === "swap") {
    const { error } = await sb
      .from("assignments")
      .delete()
      .eq("applicant_id", input.applicant_id)
      .ilike("reviewer_email", from!);
    if (error) return { ok: false, error: error.message };
  }
  if (input.action === "add" || input.action === "swap") {
    const { error } = await sb
      .from("assignments")
      .upsert(
        { applicant_id: input.applicant_id, reviewer_email: to! },
        { onConflict: "applicant_id,reviewer_email" }
      );
    if (error) return { ok: false, error: error.message };
  }

  const { data: after } = await sb
    .from("assignments")
    .select("reviewer_email")
    .eq("applicant_id", input.applicant_id);
  return { ok: true, assigned: (after ?? []).map((r) => String(r.reviewer_email)).sort() };
}

/**
 * Every cycle that actually has applications, newest first.
 *
 * What the console's cycle picker is built from. Derived from the applicant rows
 * rather than from a list of cycles someone maintains, so it can never offer a
 * cohort that turns out to be empty, and a cycle appears the moment its first
 * application arrives.
 *
 * One column over the whole table: PostgREST has no DISTINCT, so the dedupe
 * happens here. Cheap at club scale, and `sortCycles` canonicalises on the way
 * through, so a row written before normalisation was enforced still lands in the
 * right bucket instead of showing up as a second, near-identical entry.
 */
export async function listCycles(): Promise<string[]> {
  const sb = db();
  if (!sb) return cyclesPresent(DEMO_APPLICANTS);
  const { data, error } = await sb.from("applicants").select("cycle");
  if (error) throw error;
  return cyclesPresent((data ?? []) as { cycle: string }[]);
}

export { MIN_REVIEWERS_PER_APPLICANT };
