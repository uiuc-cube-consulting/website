// Reviewer coverage + manual reassignment rules. Pure, no I/O — safe to import
// from client components so the UI can show the same warnings the API enforces.
//
// Two things live here, both driven by how deliberations actually go wrong:
//
//   COVERAGE. Every written application must be seen by at least two people. The
//   random even spread from `planAssignments` sets that up, but it does not hold
//   it: applicants arrive after an assignment run, reviewers go inactive, and a
//   candidate quietly ends up with one opinion — or none — behind them. Coverage
//   is therefore computed from the live tables rather than assumed from the last
//   run, and reported per applicant so exec can see the gap before delibs, not
//   during.
//
//   REROUTING. When someone does not show up on the day, exec needs to move that
//   candidate onto somebody who is in the room. That is a deliberate, audited
//   act, so it is a distinct operation from the random spread rather than a
//   re-run with different numbers.

import type { Assignment, Review } from "./types";
import { isScreenReview } from "./types";

/**
 * Minimum independent reviewers per written application.
 *
 * Two is the point at which a score stops being one person's opinion: it gives
 * `aggregate()` a spread to report, which is the only signal that catches a
 * miscalibrated reviewer. One reviewer produces a mean with no spread and looks
 * identical to consensus.
 */
export const MIN_REVIEWERS_PER_APPLICANT = 2;

export type Coverage = {
  applicant_id: string;
  name: string;
  email: string;
  stage: string;
  /** Reviewers currently on the hook. */
  assigned: string[];
  /** Reviewers who have actually submitted a SCREEN review. */
  reviewed: string[];
  /** Assigned but not yet submitted — who to chase. */
  outstanding: string[];
  /** Fewer than MIN reviewers assigned: a gap nobody is working on. */
  underAssigned: boolean;
  /** Fewer than MIN reviews submitted: not yet safe to decide on. */
  underReviewed: boolean;
};

const lower = (s: string) => (s ?? "").toLowerCase();

/**
 * Per-applicant coverage. Only SCREEN reviews count — case and behavioral
 * rubrics score a different rubric at a later stage, so letting them satisfy the
 * written-application minimum would mean a candidate reaching finals on one
 * written read.
 */
export function computeCoverage(
  applicants: { id: string; name: string; email: string; stage: string }[],
  assignments: Assignment[],
  reviews: Review[]
): Coverage[] {
  const assignedBy = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (!assignedBy.has(a.applicant_id)) assignedBy.set(a.applicant_id, new Set());
    assignedBy.get(a.applicant_id)!.add(lower(a.reviewer_email));
  }

  const reviewedBy = new Map<string, Set<string>>();
  for (const r of reviews) {
    if (!isScreenReview(r)) continue;
    if (!reviewedBy.has(r.applicant_id)) reviewedBy.set(r.applicant_id, new Set());
    reviewedBy.get(r.applicant_id)!.add(lower(r.reviewer_email));
  }

  return applicants.map((a) => {
    const assigned = [...(assignedBy.get(a.id) ?? [])].sort();
    const reviewed = [...(reviewedBy.get(a.id) ?? [])].sort();
    const reviewedSet = new Set(reviewed);
    return {
      applicant_id: a.id,
      name: a.name,
      email: a.email,
      stage: a.stage,
      assigned,
      reviewed,
      outstanding: assigned.filter((e) => !reviewedSet.has(e)),
      underAssigned: assigned.length < MIN_REVIEWERS_PER_APPLICANT,
      // A review counts wherever it came from — an exec override still counts as
      // an eye on the candidate, even though the reviewer was never assigned.
      underReviewed: reviewed.length < MIN_REVIEWERS_PER_APPLICANT,
    };
  });
}

export type CoverageSummary = {
  total: number;
  fullyAssigned: number;
  fullyReviewed: number;
  underAssigned: Coverage[];
  underReviewed: Coverage[];
};

export function summarizeCoverage(rows: Coverage[]): CoverageSummary {
  const underAssigned = rows.filter((r) => r.underAssigned);
  const underReviewed = rows.filter((r) => r.underReviewed);
  return {
    total: rows.length,
    fullyAssigned: rows.length - underAssigned.length,
    fullyReviewed: rows.length - underReviewed.length,
    underAssigned,
    underReviewed,
  };
}

// ── Manual reassignment ──────────────────────────────────────────────────────

export type ReassignAction = "add" | "remove" | "swap";

export type ReassignInput = {
  action: ReassignAction;
  applicant_id: string;
  /** Reviewer being added (add, swap). */
  to?: string;
  /** Reviewer being removed (remove, swap). */
  from?: string;
  /** Allow a removal that drops the applicant below the minimum. */
  force?: boolean;
};

export type ValidationResult = { ok: true } | { ok: false; error: string };

/**
 * Whether a manual reassignment is allowed, given the current state.
 *
 * `swap` exists as its own action rather than a remove followed by an add
 * because the pair is the actual intent when someone is absent — and doing it as
 * two steps would trip the below-minimum guard in between, for a change that
 * leaves the count exactly where it started.
 */
export function validateReassignment(
  input: ReassignInput,
  applicant: { id: string; email: string } | undefined,
  currentAssignees: string[],
  reviewerPool: string[]
): ValidationResult {
  if (!applicant) return { ok: false, error: "Unknown applicant." };

  const assigned = new Set(currentAssignees.map(lower));
  const pool = new Set(reviewerPool.map(lower));
  const to = input.to ? lower(input.to) : undefined;
  const from = input.from ? lower(input.from) : undefined;

  if (input.action === "add" || input.action === "swap") {
    if (!to) return { ok: false, error: "A reviewer to assign is required." };
    // Self-review is checked BEFORE pool eligibility so the reason is the true
    // one. A returning member who reapplies is in the reviewer pool, so the
    // eligibility check would pass and this is the only thing standing between
    // them and scoring their own application.
    if (to === lower(applicant.email)) {
      return { ok: false, error: "A candidate cannot review their own application." };
    }
    if (!pool.has(to)) {
      return { ok: false, error: `${to} is not an eligible reviewer. They need a recruiting role.` };
    }
    if (assigned.has(to) && input.action === "add") {
      return { ok: false, error: `${to} is already assigned to this candidate.` };
    }
  }

  if (input.action === "remove" || input.action === "swap") {
    if (!from) return { ok: false, error: "A reviewer to remove is required." };
    if (!assigned.has(from)) {
      return { ok: false, error: `${from} is not assigned to this candidate.` };
    }
  }

  if (input.action === "swap" && to === from) {
    return { ok: false, error: "Cannot swap a reviewer with themselves." };
  }

  // Removing outright can leave a candidate under-reviewed; swapping never does,
  // because the seat is filled in the same operation.
  if (input.action === "remove" && !input.force) {
    if (assigned.size - 1 < MIN_REVIEWERS_PER_APPLICANT) {
      return {
        ok: false,
        error:
          `Removing ${from} leaves ${assigned.size - 1} reviewer(s), below the minimum of ` +
          `${MIN_REVIEWERS_PER_APPLICANT}. Swap in a replacement instead, or pass force to override.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Reviewers eligible to take a candidate, least-loaded first — so exec routing
 * under time pressure defaults to spreading load rather than piling onto whoever
 * comes first alphabetically. Excludes anyone already on the candidate and the
 * candidate themselves.
 */
export function suggestReviewers(
  applicant: { id: string; email: string },
  currentAssignees: string[],
  reviewerPool: string[],
  allAssignments: Assignment[],
  limit = 5
): { email: string; load: number }[] {
  const load = new Map<string, number>(reviewerPool.map((e) => [lower(e), 0]));
  for (const a of allAssignments) {
    const e = lower(a.reviewer_email);
    if (load.has(e)) load.set(e, (load.get(e) ?? 0) + 1);
  }
  const taken = new Set(currentAssignees.map(lower));
  const self = lower(applicant.email);

  return [...load.entries()]
    .filter(([email]) => !taken.has(email) && email !== self)
    .map(([email, n]) => ({ email, load: n }))
    .sort((a, b) => a.load - b.load || a.email.localeCompare(b.email))
    .slice(0, limit);
}
