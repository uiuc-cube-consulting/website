// Point categories and submissions — the event menu members submit against,
// and the rules a submission is checked by. Pure and client-safe: the form, the
// standings board and the API import the same table, so what the UI offers is
// exactly what the server accepts.
//
// Source: the exec "Point Breakdowns" sheet (FA26). Points and max repeats are
// fixed per event, so a member picks WHAT they did and the points follow from
// it. Nobody types a number that exec then has to second-guess. Exec can still
// award or deduct points in any category by hand from the standings board
// (/api/points).

export type PointCategory = "fundamentals" | "professional" | "social";
export type Cohort = "new" | "returning";
export type SubmissionStatus = "pending" | "approved" | "rejected";

export type PointEvent = {
  /** Stored on each submission. Never rename a key that has submissions against it. */
  key: string;
  category: PointCategory;
  label: string;
  points: number;
  /** How many times the event counts per member, per semester. */
  maxRepeats: number;
  /** Marked ** on the sheet: required points for the new cohort. */
  requiredForNewCohort: boolean;
};

export const POINT_CATEGORIES: {
  key: PointCategory;
  label: string;
  required: Record<Cohort, number>;
}[] = [
  { key: "fundamentals", label: "Fundamentals", required: { new: 5, returning: 3 } },
  { key: "professional", label: "Professional", required: { new: 6, returning: 3 } },
  { key: "social", label: "Social", required: { new: 5, returning: 3 } },
];

export type CategoryTotals = Record<PointCategory, number>;

export function emptyCategoryTotals(): CategoryTotals {
  return { fundamentals: 0, professional: 0, social: 0 };
}

export function isPointCategory(value: unknown): value is PointCategory {
  return POINT_CATEGORIES.some((c) => c.key === value);
}

/**
 * Who may submit points: every role on the points board. Listed out rather than
 * "anyone but exec", so a session with no role, or a role added to the schema
 * later, isn't let in by default.
 */
export const SUBMITTER_ROLES = ["project_manager", "senior_consultant", "returning_member", "member"] as const;

export function canSubmitPoints(role?: string | null): boolean {
  return Boolean(role && (SUBMITTER_ROLES as readonly string[]).includes(role));
}

function event(
  category: PointCategory,
  key: string,
  label: string,
  points: number,
  maxRepeats: number,
  requiredForNewCohort = false
): PointEvent {
  return { key, category, label, points, maxRepeats, requiredForNewCohort };
}

export const POINT_EVENTS: PointEvent[] = [
  event("fundamentals", "exec-1on1", "1:1 with an exec member", 1, 3, true),
  event("fundamentals", "team-presentation", "Attend another team's midpoint or final presentation", 1, 2),
  event("fundamentals", "committee-meeting", "Attend a committee meeting", 1, 2, true),
  event("fundamentals", "social-repost", "Repost CUBE events and fundraisers on social media", 1, 2, true),
  event("fundamentals", "fundraiser-volunteer", "Fundraiser / volunteering help", 1, 2),
  event("fundamentals", "instagram-reel", "Participate or act in an Instagram Reel", 1, 1),

  event("professional", "resume-review", "Resume review", 1, 2, true),
  event("professional", "mock-case", "Mock case interview", 2, 1, true),
  event("professional", "alumni-mentor", "Meeting with an alumni mentor", 1, 2, true),
  event("professional", "linkedin-review", "LinkedIn review", 1, 1, true),
  event("professional", "cube-mentor", "Meeting with an active CUBE mentor", 1, 3, true),

  event("social", "project-social", "Project-wide social", 1, 2),
  event("social", "consultant-1on1", "1:1 with a fellow consultant", 1, 1),
  event("social", "pm-1on1", "1:1 with a PM (outside your project team)", 1, 2),
  event("social", "sc-1on1", "1:1 with an SC (outside your project team)", 1, 2),
  event("social", "cube-social", "Attend a CUBE-wide social", 1, 2),
];

/** A submission as the API returns it. Declared here so client code can use it. */
export type SubmissionRow = {
  id: string;
  created_at: string;
  member_id: string;
  member_name: string | null;
  member_email: string | null;
  member_role: string | null;
  category: PointCategory;
  event_key: string;
  event_label: string;
  points: number;
  /** YYYY-MM-DD */
  occurred_on: string;
  note: string | null;
  status: SubmissionStatus;
  reviewed_at: string | null;
  review_note: string | null;
  reviewer_name: string | null;
};

/** The part of a submission the rules look at. */
export type SubmissionLike = Pick<SubmissionRow, "event_key" | "status" | "points" | "category">;

export const MAX_NOTE = 500;

export function categoryLabel(category: PointCategory): string {
  return POINT_CATEGORIES.find((c) => c.key === category)?.label ?? category;
}

export function findEvent(key: unknown): PointEvent | null {
  if (typeof key !== "string") return null;
  return POINT_EVENTS.find((e) => e.key === key) ?? null;
}

export function eventsIn(category: PointCategory): PointEvent[] {
  return POINT_EVENTS.filter((e) => e.category === category);
}

/**
 * `member` is the first-semester role (db/seed-new-members-fa26.sql); every
 * other role on the board has been in the club before.
 */
export function cohortFor(role?: string | null): Cohort {
  return role === "member" ? "new" : "returning";
}

/**
 * How many times this event has been used against its limit.
 *
 * Pending counts as well as approved. Otherwise a member could queue five of a
 * max-2 event and leave exec to reject three. A rejected submission frees its
 * slot, so a blurry photo can be resubmitted.
 */
export function repeatsUsed(subs: SubmissionLike[], key: string): number {
  return subs.filter((s) => s.event_key === key && s.status !== "rejected").length;
}

export function repeatsLeft(ev: PointEvent, subs: SubmissionLike[]): number {
  return Math.max(0, ev.maxRepeats - repeatsUsed(subs, ev.key));
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export type ValidatedSubmission =
  | { ok: true; event: PointEvent; occurredOn: string; note: string | null }
  | { ok: false; status: 400 | 409; error: string };

/**
 * Check a submission against the catalog and the member's own history.
 *
 * `now` is the server clock, in UTC. A day of slack on the future-date check
 * covers members in Central time submitting an evening event after UTC has
 * already rolled over to tomorrow.
 */
export function validateSubmission(
  input: { event_key: unknown; occurred_on: unknown; note: unknown },
  existing: SubmissionLike[],
  now: Date = new Date()
): ValidatedSubmission {
  const ev = findEvent(input.event_key);
  if (!ev) return { ok: false, status: 400, error: "Pick the event this is for." };

  if (!isIsoDate(input.occurred_on)) {
    return { ok: false, status: 400, error: "Enter the date of the event." };
  }
  const latest = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  if (input.occurred_on > latest) {
    return { ok: false, status: 400, error: "The event date can't be in the future." };
  }

  let note: string | null = null;
  if (input.note !== null && input.note !== undefined) {
    if (typeof input.note !== "string") return { ok: false, status: 400, error: "Note must be text." };
    note = input.note.trim() || null;
    if (note && note.length > MAX_NOTE) {
      return { ok: false, status: 400, error: `Keep the note under ${MAX_NOTE} characters.` };
    }
  }

  if (repeatsLeft(ev, existing) === 0) {
    const times = ev.maxRepeats === 1 ? "once" : `${ev.maxRepeats} times`;
    return {
      ok: false,
      status: 409,
      error: `"${ev.label}" only counts ${times}, and you've already submitted it that many times.`,
    };
  }

  return { ok: true, event: ev, occurredOn: input.occurred_on, note };
}

export type CategoryProgress = {
  category: PointCategory;
  label: string;
  required: number;
  /** Points in the ledger for this category: approved submissions plus exec awards. */
  approved: number;
  /** Points from submissions still waiting on exec. */
  pending: number;
};

/**
 * Progress toward each category's requirement.
 *
 * Approved points come from the LEDGER (`ledger`, the member's per-category sums
 * of point_entries), not from approved submissions. An approval writes a ledger
 * entry, and exec also award category points by hand on the standings board, so
 * counting approved submissions as well would count those points twice. Pending
 * points come from submissions, because they aren't in the ledger yet.
 */
export function progressFor(cohort: Cohort, ledger: CategoryTotals, subs: SubmissionLike[]): CategoryProgress[] {
  return POINT_CATEGORIES.map((c) => ({
    category: c.key,
    label: c.label,
    required: c.required[cohort],
    approved: ledger[c.key],
    pending: subs
      .filter((s) => s.category === c.key && s.status === "pending")
      .reduce((n, s) => n + s.points, 0),
  }));
}

/** Required (**) events a new member hasn't submitted yet. Returning members have none. */
export function missingRequiredEvents(cohort: Cohort, subs: SubmissionLike[]): PointEvent[] {
  if (cohort !== "new") return [];
  return POINT_EVENTS.filter((e) => e.requiredForNewCohort && repeatsUsed(subs, e.key) === 0);
}

/** The `reason` written to the points ledger when a submission is approved. */
export function ledgerReason(sub: Pick<SubmissionRow, "category" | "event_label">): string {
  return `${categoryLabel(sub.category)}: ${sub.event_label}`;
}
