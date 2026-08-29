// Server half of the self-access rule (see ./self-access.ts for the rule itself
// and why it exists). Never import from client code.
//
// Read routes already hold the whole applicant set and can redact with the pure
// helpers. WRITE routes cannot: a review, a decision, a rubric and a resume
// stream all arrive carrying nothing but an `applicant_id`, so there is no email
// to compare against the session until one is fetched. That fetch is here, as
// one indexed lookup, rather than in four routes that would each have to
// remember to do it.
//
// Same Supabase-or-demo posture as lib/store.ts: no env → demo data.

import { createServerClient } from "@/lib/supabase/server";
import { DEMO_APPLICANTS } from "./demo";
import { isOwnApplication } from "./self-access";

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

/** Just enough of an applicant to answer "is this me, and which cohort is it?" */
export type ApplicantIdentity = { id: string; email: string; cycle: string | null };

/** The email and cycle behind one applicant id, or null if there is no such row. */
export async function getApplicantIdentity(applicantId: string): Promise<ApplicantIdentity | null> {
  if (!applicantId) return null;

  const sb = db();
  if (!sb) {
    const demo = DEMO_APPLICANTS.find((a) => a.id === applicantId);
    return demo ? { id: demo.id, email: demo.email, cycle: demo.cycle } : null;
  }

  const { data, error } = await sb
    .from("applicants")
    .select("id, email, cycle")
    .eq("id", applicantId)
    .maybeSingle();
  if (error || !data) return null;
  return { id: String(data.id), email: String(data.email), cycle: (data.cycle as string | null) ?? null };
}

/**
 * Is `applicantId` the viewer's own application?
 *
 * Returns false for an unknown id: a write to a nonexistent applicant is not a
 * self-access problem, and reporting it as one would tell the caller "that is
 * your application" about a row that does not exist. The route's own validation
 * (or the database's foreign key) rejects it a moment later with an accurate
 * message.
 *
 * A failed lookup is indistinguishable from an unknown id here, so this is not
 * the only thing standing between a member and their own scores — the read
 * paths redact independently, from data they already have.
 */
export async function isOwnApplicationId(
  applicantId: string,
  viewerEmail: string | null | undefined
): Promise<boolean> {
  const identity = await getApplicantIdentity(applicantId);
  if (!identity) return false;
  return isOwnApplication(viewerEmail, identity.email);
}

/**
 * Every application the viewer has ever filed, newest cycle first.
 *
 * Not used to show them anything — that is the whole point — but a member is
 * entitled to know the system holds an application from them, and exec needs it
 * to answer "why can't I see this candidate?" without a database console. Only
 * ids and cycles come back; no responses, no scores, no notes.
 */
export async function getOwnApplicationStubs(
  viewerEmail: string | null | undefined
): Promise<{ id: string; cycle: string | null }[]> {
  const viewer = (viewerEmail ?? "").trim().toLowerCase();
  if (!viewer) return [];

  const sb = db();
  if (!sb) {
    return DEMO_APPLICANTS.filter((a) => isOwnApplication(viewer, a.email)).map((a) => ({
      id: a.id,
      cycle: a.cycle,
    }));
  }

  // Matched in memory rather than in the query on purpose. `applicants.email` is
  // not stored case-normalised (unlike `applicant_flags.subject_email`, which has
  // a CHECK forcing lowercase), so an equality filter would miss "Jane@…" and an
  // `ilike` would treat the `_` and `%` that are legal in an email local part as
  // wildcards — matching other people's applications. The projection is three
  // columns over a table `getSnapshot` already reads whole on every dashboard
  // load, so this costs nothing worth the subtlety of escaping LIKE patterns.
  const { data, error } = await sb.from("applicants").select("id, cycle, email");
  if (error || !data) return [];
  return data
    .filter((a) => isOwnApplication(viewer, String(a.email)))
    .map((a) => ({ id: String(a.id), cycle: (a.cycle as string | null) ?? null }));
}
