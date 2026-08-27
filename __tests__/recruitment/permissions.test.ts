/**
 * Role-permission audit.
 *
 * Drives the REAL route handlers once per role and asserts the authorization
 * decision. This is the practical stand-in for "log in as a dummy account": auth
 * is Google OAuth, so no fabricated row in `members` can produce a real session —
 * but every route reads its role from `auth()`, so mocking that exercises exactly
 * the code path a real sign-in would hit.
 *
 * Two properties are checked for each route:
 *   1. every role that SHOULD have access gets it, and
 *   2. every role that should NOT is refused — the half that actually matters,
 *      and the half a manual click-through almost never covers, because the UI
 *      hides the button and you never discover the API would have allowed it.
 *
 * The gap this was written after: proxy.ts redirects a plain `member` away from
 * /portal/recruiting, but three API routes checked only "is signed in", so a
 * member could curl the applicant pool and read every candidate's essays.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSession: { user: { email: string; role: string; memberId?: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

// Data layer is stubbed: this suite is about WHO may call, not what is returned.
const stub = {
  getSnapshot: jest.fn(async () => ({ applicants: [], reviews: [], demo: false })),
  getAssignments: jest.fn(async () => [
    { applicant_id: "assigned-app", reviewer_email: "user@illinois.edu" },
  ]),
  submitReview: jest.fn(async () => ({ ok: true })),
  setDecision: jest.fn(async () => ({ ok: true })),
};
jest.mock("@/features/03-recruitment-ats/lib/store", () => ({
  getSnapshot: (...a: unknown[]) => stub.getSnapshot(...(a as [])),
  getAssignments: (...a: unknown[]) => stub.getAssignments(...(a as [])),
  submitReview: (...a: unknown[]) => stub.submitReview(...(a as [])),
  setDecision: (...a: unknown[]) => stub.setDecision(...(a as [])),
}));

import { NextRequest } from "next/server";
import { GET as applicantsGET } from "@/features/03-recruitment-ats/app/api/recruitment/applicants/route";
import { POST as reviewsPOST } from "@/features/03-recruitment-ats/app/api/recruitment/reviews/route";
import { POST as decisionsPOST, GET as decisionsGET } from "@/features/03-recruitment-ats/app/api/recruitment/decisions/route";
import {
  isExec,
  canAccessRecruiting,
  canReview,
  canDecide,
  canReviewApplicant,
  RECRUITING_ROLES,
} from "@/features/03-recruitment-ats/lib/access";

// Every role the schema allows (db/schema.sql members_role_check), plus the
// signed-out case. If a role is ever added, this list must grow with it.
const ROLES = [
  "exec",
  "project_manager",
  "senior_consultant",
  "returning_member",
  "member",
] as const;
type Role = (typeof ROLES)[number];

function signInAs(role: Role | null, email = "user@illinois.edu") {
  mockSession = role ? { user: { email, role, memberId: "m1" } } : null;
}

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_SCORES = { problem_solving: 4, communication: 4, drive: 4, fit: 4 };

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = null;
});

// ── The matrix ───────────────────────────────────────────────────────────────

/** Roles expected to be ALLOWED, per surface. Everything else must be refused. */
const EXPECTED: Record<string, Role[]> = {
  // Every member can view the applicant pool, look applicants up, and flag them
  // — club-wide transparency. Scoring, assignment, and decisions stay narrower.
  "read the applicant pool": [
    "exec",
    "project_manager",
    "senior_consultant",
    "returning_member",
    "member",
  ],
  "submit a screen review": ["exec", "project_manager", "senior_consultant", "returning_member"],
  "change an applicant's stage": ["exec"],
};

describe("access predicates", () => {
  it("recruiting STAFF roles (reviewer/interviewer pool) are exactly the four non-member roles", () => {
    expect([...RECRUITING_ROLES]).toEqual([
      "exec",
      "project_manager",
      "senior_consultant",
      "returning_member",
    ]);
    // Viewing, however, is club-wide: a plain member CAN read the applicant pool
    // and flag it, just not review, assign, or decide.
    expect(canAccessRecruiting("member")).toBe(true);
  });

  it("isExec is true for exec alone", () => {
    for (const r of ROLES) expect(isExec(r)).toBe(r === "exec");
  });

  it("deciding is strictly narrower than reviewing", () => {
    for (const r of ROLES) {
      if (canDecide(r)) expect(canReview(r)).toBe(true); // decide implies review
    }
    // ...and strictly: at least one role reviews but cannot decide.
    expect(canReview("senior_consultant") && !canDecide("senior_consultant")).toBe(true);
  });

  it("treats an unknown or absent role as no access", () => {
    for (const bogus of [undefined, null, "", "admin", "ADMIN", "Exec", "superuser"]) {
      expect(canAccessRecruiting(bogus)).toBe(false);
      expect(canDecide(bogus)).toBe(false);
      expect(canReview(bogus)).toBe(false);
    }
  });
});

describe("GET /api/recruitment/applicants — applicant PII", () => {
  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await applicantsGET();
    const allowed = EXPECTED["read the applicant pool"].includes(role);
    expect(res.status).toBe(allowed ? 200 : 403);
  });

  it("signed out", async () => {
    signInAs(null);
    expect((await applicantsGET()).status).toBe(401);
  });

  it("reports canManage only for exec", async () => {
    for (const role of EXPECTED["read the applicant pool"]) {
      signInAs(role);
      const body = await (await applicantsGET()).json();
      expect(body.canManage).toBe(role === "exec");
    }
  });
});

describe("POST /api/recruitment/decisions — stage changes", () => {
  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await decisionsPOST(post({ applicant_id: "a1", stage: "rejected" }));
    const allowed = EXPECTED["change an applicant's stage"].includes(role);
    expect(res.status).toBe(allowed ? 200 : 403);
    // The refusal must happen BEFORE any write.
    if (!allowed) expect(stub.setDecision).not.toHaveBeenCalled();
  });

  it("signed out", async () => {
    signInAs(null);
    expect((await decisionsPOST(post({ applicant_id: "a1", stage: "rejected" }))).status).toBe(401);
    expect(stub.setDecision).not.toHaveBeenCalled();
  });

  it("a reviewer cannot reject a candidate", async () => {
    signInAs("senior_consultant");
    const res = await decisionsPOST(post({ applicant_id: "a1", stage: "rejected" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/exec/i);
  });
});

describe("POST /api/recruitment/reviews — scoring", () => {
  it.each(ROLES)("%s, when assigned", async (role) => {
    signInAs(role);
    const res = await reviewsPOST(post({ applicant_id: "assigned-app", scores: VALID_SCORES }));
    const allowed = EXPECTED["submit a screen review"].includes(role);
    expect(res.status).toBe(allowed ? 200 : 403);
    if (!allowed) expect(stub.submitReview).not.toHaveBeenCalled();
  });

  it("refuses an applicant the reviewer was not assigned", async () => {
    signInAs("senior_consultant");
    const res = await reviewsPOST(post({ applicant_id: "someone-elses", scores: VALID_SCORES }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/not assigned/i);
    expect(stub.submitReview).not.toHaveBeenCalled();
  });

  it("lets exec override the assignment", async () => {
    signInAs("exec");
    const res = await reviewsPOST(post({ applicant_id: "someone-elses", scores: VALID_SCORES }));
    expect(res.status).toBe(200);
  });

  it("reports a bad payload as 400, not as a permission error", async () => {
    signInAs("senior_consultant");
    const res = await reviewsPOST(post({ applicant_id: "assigned-app", scores: { problem_solving: 9 } }));
    expect(res.status).toBe(400);
  });

  it("matches assignment case-insensitively", () => {
    const assignments = [{ applicant_id: "a1", reviewer_email: "User@Illinois.EDU" }];
    expect(canReviewApplicant("senior_consultant", "user@illinois.edu", "a1", assignments)).toBe(true);
  });

  it("does not let an assignment grant a role it lacks", () => {
    // Being assigned must never substitute for having a recruiting role.
    const assignments = [{ applicant_id: "a1", reviewer_email: "user@illinois.edu" }];
    expect(canReviewApplicant("member", "user@illinois.edu", "a1", assignments)).toBe(false);
  });
});

// ── Pipeline exec gate ───────────────────────────────────────────────────────
// Separate concern from recruiting, same class of bug. isExec() used to end in
// `return true` for a session carrying no role, which meant any signed-in member
// could read the client pipeline whenever PIPELINE_EXEC_ALLOWLIST was blank —
// and .env.example instructs you to leave it blank.

describe("pipeline isExec — must fail closed", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { isExec: pipelineIsExec } = require("@/features/02-pipeline-crm/lib/pipeline");
  const original = process.env.PIPELINE_EXEC_ALLOWLIST;
  afterEach(() => { process.env.PIPELINE_EXEC_ALLOWLIST = original; });

  it.each(ROLES)("honours the role when present: %s", (role) => {
    expect(pipelineIsExec({ user: { email: "u@i.edu", role } })).toBe(role === "exec");
  });

  it("denies a roleless session when no allowlist is configured", () => {
    delete process.env.PIPELINE_EXEC_ALLOWLIST;
    expect(pipelineIsExec({ user: { email: "u@i.edu" } })).toBe(false);
    expect(pipelineIsExec({ user: {} })).toBe(false);
    expect(pipelineIsExec(null)).toBe(false);
  });

  it("denies a roleless session when the allowlist is blank or whitespace", () => {
    for (const v of ["", "   ", ",, ,"]) {
      process.env.PIPELINE_EXEC_ALLOWLIST = v;
      expect(pipelineIsExec({ user: { email: "u@i.edu" } })).toBe(false);
    }
  });

  it("still honours an explicitly configured allowlist", () => {
    process.env.PIPELINE_EXEC_ALLOWLIST = "boss@cubeconsulting.org";
    expect(pipelineIsExec({ user: { email: "boss@cubeconsulting.org" } })).toBe(true);
    expect(pipelineIsExec({ user: { email: "BOSS@CubeConsulting.org" } })).toBe(true);
    expect(pipelineIsExec({ user: { email: "someone@illinois.edu" } })).toBe(false);
  });
});

// ── The exec-only decision queue (unblinded reviews) ─────────────────────────
// This route exposes every reviewer's individual scores and notes, which the
// reviewer feed deliberately hides. Anyone below exec reaching it would defeat
// the blind screen, so it gets its own coverage.

describe("GET /api/recruitment/decisions — unblinded verdicts", () => {
  function get(): NextRequest {
    return new NextRequest("http://localhost/api/recruitment/decisions?order=score");
  }

  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await decisionsGET(get());
    expect(res.status).toBe(role === "exec" ? 200 : 403);
  });

  it("signed out", async () => {
    signInAs(null);
    expect((await decisionsGET(get())).status).toBe(401);
  });

  it("does not leak reviews to a reviewer who is refused", async () => {
    signInAs("senior_consultant");
    const body = await (await decisionsGET(get())).json();
    expect(body.rows).toBeUndefined();
    expect(body.error).toMatch(/exec/i);
  });
});
