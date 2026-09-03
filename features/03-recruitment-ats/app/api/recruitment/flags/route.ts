import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPendingFlags, removeFlag, submitFlag } from "@/features/03-recruitment-ats/lib/store";
import { canFlag, isExec } from "@/features/03-recruitment-ats/lib/access";
import { canViewRecruiting, getActiveCycle } from "@/features/03-recruitment-ats/lib/visibility";
// Not SELF_ACCESS_DENIED: that wording is about withholding your application
// file and its scores, which is not what refusing a self-flag is about.
import { isOwnApplication } from "@/features/03-recruitment-ats/lib/self-access";
import { isOwnApplicationId } from "@/features/03-recruitment-ats/lib/self-access-store";

// Auth-gated: any signed-in member can flag a person red or green. Removable by
// exec, or by whoever filed it (DELETE below) — and "removed" means hidden, never
// deleted, so taking a flag down is itself on the record. See db/flag-removal.sql.
//
// Two shapes of POST:
//   { applicant_id, color, description }        — from a candidate's profile
//   { subject_email, color, description, … }    — from an event, before they apply
//
// The second is NOT gated on recruiting visibility, and that is the point. Event
// flags are filed in exactly the window when recruiting is closed — the weeks
// between cycles, right after an info night or a round of coffee chats. Gating
// them on `canViewRecruiting` would switch the feature off for precisely the
// period it exists to serve. What the gate still protects is applicant DATA:
// flagging by applicant_id, and learning whether an email is already in the
// pipeline, both stay behind it.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canFlag(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: "Recruiting access required" }, { status: 403 });
  }

  let body: {
    applicant_id?: string;
    subject_email?: string;
    subject_name?: string;
    event?: string;
    color?: string;
    description?: string;
    attributed?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const applicantId = body.applicant_id?.trim() || null;
  const subjectEmail = body.subject_email?.trim().toLowerCase() || null;

  if (!applicantId && !subjectEmail) {
    return NextResponse.json(
      { ok: false, error: "applicant_id or subject_email required" },
      { status: 400 }
    );
  }
  if (!applicantId && !/.+@.+\..+/.test(subjectEmail!)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }

  const canView = await canViewRecruiting(session?.user?.role);
  // Flagging an existing candidate is a read of the applicant pool by another
  // name — you have to know they are in it. Filing against a bare email is not.
  if (applicantId && !canView) {
    return NextResponse.json({ ok: false, error: "Recruiting is currently closed" }, { status: 403 });
  }

  // Nobody files a flag on themselves. A green flag on your own application is
  // self-dealing, a red one is noise, and either way a flag is meant to be one
  // member's observation of ANOTHER person. Blocked in both shapes: by email,
  // and by an applicant id that turns out to be one of your own applications.
  const selfByEmail = isOwnApplication(email, subjectEmail);
  const selfById = applicantId ? await isOwnApplicationId(applicantId, email) : false;
  if (selfByEmail || selfById) {
    return NextResponse.json({ ok: false, error: "You can't flag yourself." }, { status: 403 });
  }

  if (body.color !== "red" && body.color !== "green") {
    return NextResponse.json({ ok: false, error: "color must be red or green" }, { status: 400 });
  }
  const description = body.description?.trim() ?? "";
  if (!description) return NextResponse.json({ ok: false, error: "description is required" }, { status: 400 });

  const result = await submitFlag({
    applicant_id: applicantId,
    subject_email: subjectEmail,
    subject_name: body.subject_name ?? null,
    event: body.event ?? null,
    submitter_email: email,
    // Opt IN, and read strictly: anything other than an explicit `true` files
    // anonymously. A missing or malformed field must never publish a name.
    attributed: body.attributed === true,
    color: body.color,
    description,
    // Which application a by-email flag attaches to. A flag filed today is an
    // observation about this cycle, so it belongs on this cycle's application —
    // not on the row from the year they were turned down, where the people
    // screening them now would never see it.
    cycle: await getActiveCycle(),
  });
  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — flag not saved." });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });

  // `linked` answers "is this email already in the pipeline?", and that question
  // stopped having one safe answer once the roster became a subset of the pool.
  //
  // GET /api/recruitment/applicants now hides `final_round` applicants from
  // everyone but exec, on the grounds that knowing who is still in it a week
  // before offers is most of the information (lib/rounds.ts: "Nobody outside
  // exec sees this round"). But `submitFlag` matches by email across every
  // stage, so reporting `linked` back to a non-exec member turns this endpoint
  // into an oracle for exactly that roster: an address missing from your
  // dashboard that still answers `linked: true` is, by elimination, someone in
  // the final round. One flag per guess, and the guesses are cheap.
  //
  // So the link is reported only to exec, who can already see the whole pool and
  // learn nothing from it. Everyone else has their flag recorded and is told
  // what actually matters — that it attaches either way. A more precise rule
  // ("report the link iff the viewer could see THAT applicant") needs the
  // matched applicant's stage plumbed back through `FlagResult`; this is the
  // version that does not trade a roster leak for a nicety.
  return NextResponse.json(
    canView && isExec(session?.user?.role) ? { ok: true, linked: result.linked } : { ok: true }
  );
}

/**
 * The pending pool: flags waiting for an application to arrive.
 *
 * Open to every member whether or not recruiting is visible, for the same reason
 * the POST is — this is the between-cycles surface. A flag drops off this list
 * the moment it is claimed, so the list itself never names an applicant.
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canFlag(session?.user?.role)) {
    return NextResponse.json({ error: "Recruiting access required" }, { status: 403 });
  }

  try {
    const { flags, demo } = await getPendingFlags(email, session?.user?.role);
    // A pending flag names its subject by email, so the pool would otherwise
    // show a member what was written about them at an info night — a red flag
    // for no-showing a coffee chat, under the name of the teammate who filed it.
    // Same rule as the rest of the pipeline (lib/self-access.ts): observations
    // about you are not yours to read, and this list is the one place a flag is
    // visible without going through an applicant row.
    const visible = flags.filter((f) => !isOwnApplication(email, f.subject_email));
    return NextResponse.json({ flags: visible, demo, viewer: email });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load pending flags" },
      { status: 500 }
    );
  }
}

/**
 * Take a flag down.
 *
 * Removal is `exec, or the person who filed it` — the rule lives in
 * `canRemoveFlag` and is enforced inside `removeFlag`, which is the only code
 * holding the unredacted submitter. This handler deliberately does NOT re-derive
 * it: an anonymous flag arrives here with no author attached, so a check written
 * at this level would either have to re-fetch the row or guess.
 *
 * Not gated on recruiting visibility, matching the POST above and for the same
 * reason: a flag filed by email between cycles has to be retractable between
 * cycles too, and the console is shut for that entire window. What the caller
 * still cannot do is learn anything new — a flag id they were never shown returns
 * the same refusal as one they may not remove.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!canFlag(session?.user?.role)) {
    return NextResponse.json({ ok: false, error: "Recruiting access required" }, { status: 403 });
  }

  // Read from the query string rather than a body: a DELETE with a payload is
  // legal but inconsistently handled by proxies and fetch wrappers, and the only
  // required field is an id.
  const id = req.nextUrl.searchParams.get("id")?.trim();
  const reason = req.nextUrl.searchParams.get("reason")?.trim() || null;
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });

  const result = await removeFlag({
    id,
    actor_email: email,
    actor_role: session?.user?.role,
    reason,
  });

  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, message: "Supabase not configured — flag not removed." });
  }
  if (result.forbidden) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 403 });
  }
  if (!result.ok) {
    // "Unknown flag" is the caller's mistake, not the server's.
    const status = result.error === "Unknown flag." ? 404 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  // `alreadyRemoved` is a success: the flag is gone, which is what was asked for.
  return NextResponse.json({ ok: true, alreadyRemoved: result.alreadyRemoved ?? false });
}
