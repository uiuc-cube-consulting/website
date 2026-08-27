/**
 * Role-permission audit, part 2: the administrative and interviewer surfaces.
 *
 * Companion to permissions.test.ts, which covers the three routes that were
 * under-gated. This file covers the ones believed to be correct, so that belief
 * is enforced rather than assumed — a future refactor that drops a role check
 * here fails the suite instead of shipping.
 *
 * Grouped by the access tier each route is supposed to sit in:
 *   exec-only     destructive or org-wide: import, assign, panel, sync, provision
 *   interviewer   the four recruiting roles: board, rubric, resume streaming
 */

let mockSession: { user: { email: string; role: string; memberId?: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

const store = {
  assignReviewers: jest.fn(async () => ({ ok: true, created: 0 })),
  importApplicants: jest.fn(async () => ({ ok: true, inserted: 0, skipped: 0 })),
  getReviewerPool: jest.fn(async () => []),
  reassignReviewer: jest.fn(async () => ({ ok: true, assigned: [] })),
  getCoverage: jest.fn(async () => ({ ok: true, rows: [] })),
};
jest.mock("@/features/03-recruitment-ats/lib/store", () => ({
  assignReviewers: (...a: unknown[]) => store.assignReviewers(...(a as [])),
  importApplicants: (...a: unknown[]) => store.importApplicants(...(a as [])),
  getReviewerPool: (...a: unknown[]) => store.getReviewerPool(...(a as [])),
  reassignReviewer: (...a: unknown[]) => store.reassignReviewer(...(a as [])),
  getCoverage: (...a: unknown[]) => store.getCoverage(...(a as [])),
}));

const interviewStore = {
  setPanel: jest.fn(async () => ({ ok: true })),
  syncResumes: jest.fn(async () => ({ ok: true, scanned: 0, linked: 0, fuzzy: 0, unmatched: [], missing: [] })),
  getBoard: jest.fn(async () => ({ candidates: [], demo: false, viewer: "v", canManage: false })),
  saveRubric: jest.fn(async () => ({ ok: true })),
};
jest.mock("@/features/03-recruitment-ats/lib/interview-store", () => ({
  setPanel: (...a: unknown[]) => interviewStore.setPanel(...(a as [])),
  syncResumes: (...a: unknown[]) => interviewStore.syncResumes(...(a as [])),
  getBoard: (...a: unknown[]) => interviewStore.getBoard(...(a as [])),
  saveRubric: (...a: unknown[]) => interviewStore.saveRubric(...(a as [])),
}));

const provision = { provisionCandidateFolders: jest.fn(async () => ({ ok: true, cycle: "F", candidates: 0, foldersCreated: 0, assetsCreated: 0, unchanged: 0, remaining: 0, noResume: [], failed: [], outcomes: [] })) };
jest.mock("@/features/03-recruitment-ats/lib/provision-store", () => ({
  provisionCandidateFolders: (...a: unknown[]) => provision.provisionCandidateFolders(...(a as [])),
}));

jest.mock("@/features/03-recruitment-ats/lib/import", () => ({
  readApplicantsFromSheet: jest.fn(async () => ({ ok: true, rows: [], total: 0 })),
}));

import { NextRequest } from "next/server";
import { POST as assignPOST } from "@/features/03-recruitment-ats/app/api/recruitment/assign/route";
import { POST as importPOST } from "@/features/03-recruitment-ats/app/api/recruitment/import/route";
import { POST as panelPOST } from "@/features/03-recruitment-ats/app/api/recruitment/interview/panel/route";
import { POST as syncPOST } from "@/features/03-recruitment-ats/app/api/recruitment/resumes/sync/route";
import { POST as provisionPOST } from "@/features/03-recruitment-ats/app/api/recruitment/folders/provision/route";
import { GET as interviewGET } from "@/features/03-recruitment-ats/app/api/recruitment/interview/route";
import { POST as manualPOST } from "@/features/03-recruitment-ats/app/api/recruitment/assign/manual/route";
import { GET as coverageGET } from "@/features/03-recruitment-ats/app/api/recruitment/coverage/route";
import { GET as reviewersGET } from "@/features/03-recruitment-ats/app/api/recruitment/reviewers/route";

const ROLES = ["exec", "project_manager", "senior_consultant", "returning_member", "member"] as const;
type Role = (typeof ROLES)[number];

const EXEC_ONLY: Role[] = ["exec"];
const INTERVIEWERS: Role[] = ["exec", "project_manager", "senior_consultant", "returning_member"];

function signInAs(role: Role | null) {
  mockSession = role ? { user: { email: "user@illinois.edu", role, memberId: "m1" } } : null;
}
function post(body: unknown = {}): NextRequest {
  return new NextRequest("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = null;
});

// ── Exec-only tier ───────────────────────────────────────────────────────────
// Each of these either mutates the whole cohort or reaches outside the app
// (Drive, Sheets), so nothing below exec should reach them.

const EXEC_ROUTES: [string, (r: NextRequest) => Promise<Response>, jest.Mock][] = [
  ["assign reviewers", (r) => assignPOST(r), store.assignReviewers],
  ["import applicants", (r) => importPOST(r), store.importApplicants],
  ["set interview panel", (r) => panelPOST(r), interviewStore.setPanel],
  ["sync resumes from Drive", (r) => syncPOST(r), interviewStore.syncResumes],
  ["provision Drive folders", (r) => provisionPOST(r), provision.provisionCandidateFolders],
  ["reroute a reviewer by hand", (r) => manualPOST(r), store.reassignReviewer],
];

describe.each(EXEC_ROUTES)("exec-only: %s", (_name, handler, sideEffect) => {
  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await handler(post({ applicant_id: "a1", interviewer_email: "x@y.edu", folderId: "f" }));
    if (EXEC_ONLY.includes(role)) {
      expect(res.status).not.toBe(403);
    } else {
      expect(res.status).toBe(403);
      // The refusal must precede the side effect, not merely hide its result.
      expect(sideEffect).not.toHaveBeenCalled();
    }
  });

  it("signed out", async () => {
    signInAs(null);
    const res = await handler(post({}));
    expect(res.status).toBe(401);
    expect(sideEffect).not.toHaveBeenCalled();
  });
});

// ── Interviewer tier ─────────────────────────────────────────────────────────

describe("interviewer tier: GET /api/recruitment/interview", () => {
  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await interviewGET();
    expect(res.status).toBe(INTERVIEWERS.includes(role) ? 200 : 403);
  });

  it("signed out", async () => {
    signInAs(null);
    expect((await interviewGET()).status).toBe(401);
  });

  it("passes canManage=true to the board only for exec", async () => {
    for (const role of INTERVIEWERS) {
      jest.clearAllMocks();
      signInAs(role);
      await interviewGET();
      const [, canManage] = interviewStore.getBoard.mock.calls[0] as unknown as [string, boolean];
      expect(canManage).toBe(role === "exec");
    }
  });
});

// ── Tier ordering ────────────────────────────────────────────────────────────

describe("tier invariants", () => {
  it("exec-only is a strict subset of the interviewer tier", () => {
    for (const r of EXEC_ONLY) expect(INTERVIEWERS).toContain(r);
    expect(INTERVIEWERS.length).toBeGreaterThan(EXEC_ONLY.length);
  });

  it("a plain member reaches no recruiting surface at all", () => {
    expect(EXEC_ONLY).not.toContain("member");
    expect(INTERVIEWERS).not.toContain("member");
  });
});

// ── The new reroute + coverage surfaces ──────────────────────────────────────

describe("exec-only: reviewer pool (reroute picker)", () => {
  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await reviewersGET();
    expect(res.status).toBe(EXEC_ONLY.includes(role) ? 200 : 403);
  });
});

describe("interviewer tier: GET /api/recruitment/coverage", () => {
  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await coverageGET();
    // Deliberately wider than exec: the quickest way to close a coverage gap is
    // for the people who owe reviews to see that they owe them.
    expect(res.status).toBe(INTERVIEWERS.includes(role) ? 200 : 403);
  });

  it("signed out", async () => {
    signInAs(null);
    expect((await coverageGET()).status).toBe(401);
  });
});

describe("reroute validation is enforced server-side", () => {
  it("rejects an unknown action before touching the store", async () => {
    signInAs("exec");
    const res = await manualPOST(post({ applicant_id: "a1", action: "delete-everything", to: "x@y.edu" }));
    expect(res.status).toBe(400);
    expect(store.reassignReviewer).not.toHaveBeenCalled();
  });

  it("requires an applicant id", async () => {
    signInAs("exec");
    const res = await manualPOST(post({ action: "add", to: "x@y.edu" }));
    expect(res.status).toBe(400);
    expect(store.reassignReviewer).not.toHaveBeenCalled();
  });
});
