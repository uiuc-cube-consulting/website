/**
 * Opt-in LIVE permission test against the real Supabase database.
 *
 *   LIVE_PERMISSIONS=1 NODE_OPTIONS=--experimental-vm-modules \
 *   npx jest __tests__/recruitment/live-permissions.test.ts
 *
 * What this adds over permissions.test.ts, which mocks the role directly: it
 * proves the whole chain the mocked tests take on faith —
 *
 *     row in `members`  ->  auth.ts lookup  ->  session role  ->  route decision
 *
 * A mocked test asserts that role "member" is refused. This asserts that a real
 * database row whose role column says 'member' actually produces that refusal,
 * which is the thing that breaks when someone edits the schema's role CHECK, or
 * seeds a role string that no code branch matches.
 *
 * SAFETY. Everything it creates it destroys:
 *   - five throwaway members on cube-test-*@illinois.edu (not real netid shapes,
 *     so they cannot collide with a person, and no Google account exists for them)
 *   - one throwaway applicant, so any WRITE that is correctly allowed lands on
 *     test data rather than a real candidate — this matters because a permitted
 *     POST /decisions would otherwise reject a real applicant for real
 *   - one assignment linking the test reviewer to the test applicant
 * afterAll deletes the applicant (cascading reviews/decisions/assignments) and the
 * members, then asserts the table is back to its original size.
 */

import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const ARMED = process.env.LIVE_PERMISSIONS === "1";
const d = ARMED ? describe : describe.skip;

function loadEnv() {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
loadEnv();

// The session is built from what the DATABASE says, not from a literal.
let mockSession: { user: { email: string; role: string; memberId: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

import { NextRequest } from "next/server";
import { GET as applicantsGET } from "@/features/03-recruitment-ats/app/api/recruitment/applicants/route";
import { POST as reviewsPOST } from "@/features/03-recruitment-ats/app/api/recruitment/reviews/route";
import { POST as decisionsPOST } from "@/features/03-recruitment-ats/app/api/recruitment/decisions/route";
import { POST as assignPOST } from "@/features/03-recruitment-ats/app/api/recruitment/assign/route";

const ROLES = ["exec", "project_manager", "senior_consultant", "returning_member", "member"] as const;
type Role = (typeof ROLES)[number];

const TEST_EMAIL = (r: Role) => `cube-test-${r.replace(/_/g, "-")}@illinois.edu`;
const TEST_APPLICANT_EMAIL = "cube-test-applicant@example.invalid";

const RECRUITING: Role[] = ["exec", "project_manager", "senior_consultant", "returning_member"];
const EXEC: Role[] = ["exec"];

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const SCORES = { problem_solving: 3, communication: 3, drive: 3, fit: 3 };

d("live permissions (real database rows)", () => {
  jest.setTimeout(180_000);

  let sb: SupabaseClient;
  let applicantId: string;
  let memberCountBefore = 0;
  /** role -> what auth.ts would actually put on the session. */
  const resolved = new Map<Role, { memberId: string; role: string }>();

  beforeAll(async () => {
    sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    const { count } = await sb.from("members").select("*", { count: "exact", head: true });
    memberCountBefore = count ?? 0;

    await sb.from("members").upsert(
      ROLES.map((r) => ({ full_name: `Test ${r}`, email: TEST_EMAIL(r), role: r, cohort: "TEST" })),
      { onConflict: "email" }
    );

    const { data: app, error } = await sb
      .from("applicants")
      .insert({ name: "Test Applicant", email: TEST_APPLICANT_EMAIL, stage: "applied", responses: {} })
      .select("id")
      .single();
    if (error) throw new Error(`could not create test applicant: ${error.message}`);
    applicantId = app.id;

    // Only the senior_consultant is assigned — so the others exercise the
    // "right role, wrong applicant" path.
    await sb.from("assignments").insert({
      applicant_id: applicantId,
      reviewer_email: TEST_EMAIL("senior_consultant"),
    });
  });

  afterAll(async () => {
    if (!sb) return;
    // Applicant first: reviews, decisions and assignments cascade off it.
    if (applicantId) await sb.from("applicants").delete().eq("id", applicantId);
    await sb.from("members").delete().in("email", ROLES.map(TEST_EMAIL));

    const { count } = await sb.from("members").select("*", { count: "exact", head: true });
    if (count !== memberCountBefore) {
      throw new Error(`CLEANUP FAILED: members went ${memberCountBefore} -> ${count}. Remove cube-test-* rows by hand.`);
    }
    const { data: leftover } = await sb.from("applicants").select("id").eq("email", TEST_APPLICANT_EMAIL);
    if (leftover?.length) throw new Error("CLEANUP FAILED: test applicant remains.");
  });

  /** Replay auth.ts exactly: look the email up, take whatever role the row holds. */
  async function signInAs(role: Role) {
    const email = TEST_EMAIL(role);
    const { data, error } = await sb.from("members").select("id, role, cohort").eq("email", email).single();
    if (error || !data) throw new Error(`auth.ts signIn() would REJECT ${email}`);
    resolved.set(role, { memberId: data.id, role: data.role });
    mockSession = { user: { email, role: data.role, memberId: data.id } };
    return data.role as Role;
  }

  it("every seeded role round-trips through the database unchanged", async () => {
    for (const role of ROLES) {
      expect(await signInAs(role)).toBe(role);
    }
  });

  it("rejects an email that is not in members (the sign-in gate)", async () => {
    const { data, error } = await sb
      .from("members").select("id").eq("email", "definitely-not-a-member@illinois.edu").single();
    // auth.ts: `if (error || !data) return false`
    expect(Boolean(error) || !data).toBe(true);
  });

  it.each(ROLES)("applicant pool — %s", async (role) => {
    await signInAs(role);
    const res = await applicantsGET();
    expect(res.status).toBe(RECRUITING.includes(role) ? 200 : 403);
  });

  it.each(ROLES)("stage decision — %s", async (role) => {
    await signInAs(role);
    const res = await decisionsPOST(post({ applicant_id: applicantId, stage: "screened" }));
    expect(res.status).toBe(EXEC.includes(role) ? 200 : 403);
  });

  it("the exec decision actually landed on the test applicant", async () => {
    const { data } = await sb.from("applicants").select("stage").eq("id", applicantId).single();
    expect(data?.stage).toBe("screened"); // written by the exec case above
  });

  it.each(ROLES)("review when NOT assigned — %s", async (role) => {
    await signInAs(role);
    const res = await reviewsPOST(post({ applicant_id: applicantId, scores: SCORES }));
    if (role === "exec") expect(res.status).toBe(200); // exec overrides assignment
    else if (role === "senior_consultant") expect(res.status).toBe(200); // the assigned one
    else if (RECRUITING.includes(role)) expect(res.status).toBe(403); // right role, not assigned
    else expect(res.status).toBe(403); // wrong role entirely
  });

  it("only the assigned reviewer and exec left a review row", async () => {
    const { data } = await sb.from("reviews").select("reviewer_email").eq("applicant_id", applicantId);
    const emails = (data ?? []).map((r) => r.reviewer_email.toLowerCase()).sort();
    expect(emails).toEqual([TEST_EMAIL("exec"), TEST_EMAIL("senior_consultant")].sort());
  });

  /**
   * Only the REFUSALS are exercised here. This file runs against the real store,
   * and letting the exec case through would run assignReviewers for real —
   * writing assignment rows for live applicants as a side effect of a test.
   * (It did exactly that on the first run.) The exec-allowed path is covered in
   * permissions-admin.test.ts, where the store is mocked and nothing escapes.
   */
  it.each(ROLES.filter((r) => !EXEC.includes(r)))("exec-only assign reviewers refuses %s", async (role) => {
    await signInAs(role);
    const res = await assignPOST(post({ k: 1 }));
    expect(res.status).toBe(403);
  });
});
