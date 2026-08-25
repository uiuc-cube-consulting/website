// Who may see and fill which project's grid. Pure predicates so the rules are
// testable and stated once — every route calls these rather than re-deriving
// role checks inline.
//
// The governing idea: authority comes from the SEAT on the project, not the
// org-wide title. A member whose members.role is 'project_manager' has no
// business rating a project they aren't on; a returning member sitting as SC on
// a project does. Exec is the only role that reads across projects.

import type { Seat } from "./types";

/**
 * Org-level roles allowed to REACH /portal/accountability. A coarse first pass
 * only — it decides who may load the page, never what they can see on it.
 *
 * `returning_member` is in the list because seats drift from titles: FA26 has
 * two people holding an SC seat on a project (VerityXR, VoiceOS) whose
 * members.role is still `returning_member`. Gating on title alone would lock
 * them out of the grid they are responsible for filling.
 *
 * That is safe precisely because the title grants nothing on its own — every
 * read and write is authorized on the project SEAT below, in the page and in
 * every route. Someone here with no rater seat sees an empty chooser, which is
 * the same thing they'd see with no access at all.
 */
export const ACCOUNTABILITY_ROLES = [
  "exec",
  "project_manager",
  "senior_consultant",
  "returning_member",
] as const;

/** Seats that fill in the grid, as opposed to appearing in it. */
export const RATER_SEATS: Seat[] = ["project_manager", "senior_consultant"];

export type Viewer = {
  memberId: string;
  role: string;
};

export function isExec(viewer: Viewer): boolean {
  return viewer.role === "exec";
}

/** Can this member reach the tracker in the first place? */
export function canAccessTracker(viewer: Viewer): boolean {
  return (ACCOUNTABILITY_ROLES as readonly string[]).includes(viewer.role);
}

/**
 * Can this member WRITE ratings for the project they hold `seat` on?
 *
 * Exec can correct any project — they are the audience for this data and need
 * to be able to fix a miskeyed cell — but they are never auto-assigned a seat,
 * so `seat` is null for them.
 */
export function canRateProject(viewer: Viewer, seat: Seat | null): boolean {
  if (isExec(viewer)) return true;
  return seat !== null && RATER_SEATS.includes(seat);
}

/**
 * Can this member READ the project's grid?
 *
 * Same set as writing, deliberately. A consultant does not see their own
 * ratings anywhere in the portal — the signal stays candid, and feedback
 * reaches them from a human via 1:1s or the strike system.
 */
export function canViewProject(viewer: Viewer, seat: Seat | null): boolean {
  return canRateProject(viewer, seat);
}
