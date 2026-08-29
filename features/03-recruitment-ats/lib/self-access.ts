// The one rule that keeps a member from reading their own application file.
// Pure predicates, no server imports: safe in client components, so the UI can
// hide exactly what the API refuses.
//
// The problem this exists to solve
// ───────────────────────────────────────────────────────────────────────────
// Almost everyone in CUBE applied to CUBE. They were scored on the calibrated
// rubric by two reviewers who did not know each other's marks, someone filed a
// red or green flag on them after an info night, and exec wrote a note next to
// the decision. All of that is still in the database, keyed by the same email
// address they now sign in with as a member.
//
// Recruiting reads are club-wide by design — `canAccessRecruiting` admits every
// member role, because transparency about the pipeline is the point. That
// baseline is correct for other people's applications and catastrophic for your
// own: without this module, a member elected to exec in fa26 can open
// /portal/recruiting, find themselves in the fa26 cohort, and read the scores
// two of their now-teammates gave them, the spread between those two, the notes
// they wrote, and whatever was flagged about them at a callout.
//
// So the rule is: **you never see, score, or decide on your own application.**
//
// Three properties of that rule are deliberate:
//
//   · It has no exec bypass. Every other gate in lib/access.ts lets exec
//     through, because exec needs to unblock a stuck queue. There is nothing to
//     unblock here — the point is to withhold information from one specific
//     person, and that person being exec makes the leak worse, not more
//     legitimate.
//
//   · It spans every cycle, not just closed ones. A member who applies again in
//     sp27 while holding a role must not watch their own live application being
//     scored, which is a strictly worse leak than reading an old one.
//
//   · It is enforced on reads AND writes. Hiding the row from the dashboard but
//     letting the same person POST a review of it, set their own stage, or
//     stream their own resume would leave the interesting half open.
//
// Matching is by email because that is what the two records actually share: an
// application row carries no member id, and names collide. `members.email` and
// `applicants.email` both come from the same person typing the same address, so
// the join is exact in practice and is normalised here in case it isn't.

/** What every route says when it refuses. One wording, so the reason is
 *  recognisable and never reads as a bug the member should report. */
export const SELF_ACCESS_DENIED =
  "This is your own application. Your application file, including its scores and reviewer notes, isn't visible to you.";

/** Emails compare case-insensitively and ignoring surrounding whitespace, the
 *  same normalisation flags use for their subject (`normalizeSubject`). */
function key(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Is this application the viewer's own?
 *
 * Fails CLOSED on a missing viewer email and OPEN on a missing applicant email:
 * an anonymous viewer is nobody's self, and an applicant row with no address
 * cannot be shown to be you. In practice neither happens — `applicants.email`
 * is NOT NULL and every route resolves the viewer from the session before
 * calling — but the asymmetry is intentional rather than accidental.
 */
export function isOwnApplication(
  viewerEmail: string | null | undefined,
  applicantEmail: string | null | undefined
): boolean {
  const viewer = key(viewerEmail);
  const applicant = key(applicantEmail);
  if (!viewer || !applicant) return false;
  return viewer === applicant;
}

/**
 * Drop the viewer's own applications from any list of rows carrying an email.
 *
 * Generic over the row shape because the same redaction has to run over several
 * different projections of an applicant — the raw rows, the aggregate the
 * reviewer dashboard renders, the coverage table, the interview board — and
 * duplicating the comparison in each of them is how one of them ends up missing
 * it.
 */
export function excludeOwnApplications<T>(
  viewerEmail: string | null | undefined,
  rows: T[],
  emailOf: (row: T) => string | null | undefined
): T[] {
  const viewer = key(viewerEmail);
  if (!viewer) return rows;
  return rows.filter((row) => key(emailOf(row)) !== viewer);
}

/**
 * The applicant ids belonging to the viewer, across every cycle.
 *
 * Rows that are merely ABOUT an application — reviews, assignments, flags,
 * decisions, interview panels — carry an `applicant_id` and no email, so they
 * cannot be redacted by address. Resolve the ids once here, then filter those
 * tables by id.
 */
export function ownApplicationIds(
  viewerEmail: string | null | undefined,
  applicants: { id: string; email: string | null | undefined }[]
): Set<string> {
  const viewer = key(viewerEmail);
  if (!viewer) return new Set();
  return new Set(applicants.filter((a) => key(a.email) === viewer).map((a) => a.id));
}

/** Drop rows that hang off one of the viewer's own applications. Pair with
 *  `ownApplicationIds` to redact reviews, assignments, flags and decisions. */
export function excludeRowsForOwnApplications<T extends { applicant_id?: string | null }>(
  rows: T[],
  ownIds: Set<string>
): T[] {
  if (ownIds.size === 0) return rows;
  return rows.filter((r) => !r.applicant_id || !ownIds.has(r.applicant_id));
}

/**
 * Has this person ever applied? Used to decide whether a member needs the
 * "some of your own history is hidden here" notice, so the redaction reads as
 * a deliberate policy rather than as data quietly missing.
 */
export function hasOwnApplication(
  viewerEmail: string | null | undefined,
  applicants: { email: string | null | undefined }[]
): boolean {
  const viewer = key(viewerEmail);
  if (!viewer) return false;
  return applicants.some((a) => key(a.email) === viewer);
}
