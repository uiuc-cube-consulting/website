// The single source of truth for who may do what in the recruitment ATS.
// Pure predicates over `session.user.role` — no server imports, safe in client
// components so the UI can hide what the API would refuse.
//
// This module exists because the role lists were previously duplicated in three
// places (INTERVIEWER_ROLES in interview.ts, REVIEWER_ROLES in store.ts, and an
// inline list in proxy.ts) and only some of them were enforced. REVIEWER_ROLES in
// particular was used only to *list* the reviewer pool and never to gate a write,
// so any signed-in member could score applicants and change their stage.
//
// The rule this file encodes: page-level gating in proxy.ts is a convenience, not
// a security boundary. Anyone can call an API route directly, so every route must
// re-check the role itself. These helpers are what it re-checks with.

/** Roles that may open the recruiting/interview area at all. */
export const RECRUITING_ROLES = [
  "exec",
  "project_manager",
  "senior_consultant",
  "returning_member",
] as const;

export type RecruitingRole = (typeof RECRUITING_ROLES)[number];

function has(list: readonly string[], role?: string | null): boolean {
  return Boolean(role && list.includes(role));
}

/** Full administrative control: import, assign, provision, decide, override. */
export function isExec(role?: string | null): boolean {
  return role === "exec";
}

/**
 * May read the applicant pool. This is the gate that protects applicant PII —
 * names, emails, and full essay responses — from a plain `member`.
 */
export function canAccessRecruiting(role?: string | null): boolean {
  return has(RECRUITING_ROLES, role);
}

/** May submit an application-screen review (subject to assignment, below). */
export function canReview(role?: string | null): boolean {
  return has(RECRUITING_ROLES, role);
}

/** May sit on an interview panel and fill in case/behavioral rubrics. */
export function canInterviewRole(role?: string | null): boolean {
  return has(RECRUITING_ROLES, role);
}

/**
 * May advance, reject, or otherwise change an applicant's stage.
 *
 * Deliberately exec-only, and deliberately narrower than `canReview`. A rejection
 * is irreversible in practice — the candidate is told — so it sits with the same
 * people who already control importing and reviewer assignment, rather than with
 * any of the ~33 reviewers.
 */
export function canDecide(role?: string | null): boolean {
  return isExec(role);
}

/**
 * Whether `reviewerEmail` may score `applicantId`.
 *
 * Reviewers are assigned randomly and evenly by `planAssignments`, which is the
 * fairness mechanism of the whole screen: nobody picks who they review. Letting
 * anyone review anyone quietly discards that property, so assignment is enforced
 * rather than merely suggested — mirroring how `saveRubric` enforces interview
 * panel membership.
 *
 * Exec bypasses, so a stuck queue can always be unblocked.
 */
export function canReviewApplicant(
  role: string | null | undefined,
  reviewerEmail: string,
  applicantId: string,
  assignments: { applicant_id: string; reviewer_email: string }[]
): boolean {
  if (!canReview(role)) return false;
  if (isExec(role)) return true;
  const email = reviewerEmail.toLowerCase();
  return assignments.some(
    (a) => a.applicant_id === applicantId && a.reviewer_email.toLowerCase() === email
  );
}
