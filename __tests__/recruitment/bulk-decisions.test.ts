/**
 * Deciding on many candidates at once.
 *
 * This is the highest-consequence button in the app: one click can end forty
 * applications. The gates that matter are the ones that are easy to skip
 * BECAUSE it is a bulk action — nobody reads forty names before confirming, so
 * a self-rejection or a stale id has to be caught by the server rather than by
 * the person clicking.
 */

let mockSession: { user: { email: string; role: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

jest.mock("@/features/03-recruitment-ats/lib/visibility", () => ({
  resolveCycle: jest.fn(async () => "fa26"),
}));

const JANE = "jane@illinois.edu";

const APPLICANTS = [
  { id: "app-jane", name: "Jane Doe", email: JANE, stage: "applied", responses: {}, created_at: "", cycle: "fa26" },
  { id: "app-bob", name: "Bob", email: "bob@illinois.edu", stage: "applied", responses: {}, created_at: "", cycle: "fa26" },
  { id: "app-cara", name: "Cara", email: "cara@illinois.edu", stage: "applied", responses: {}, created_at: "", cycle: "fa26" },
];

const stub = {
  getSnapshot: jest.fn(async () => ({
    applicants: APPLICANTS, reviews: [], flags: [], pendingFlags: [], demo: false,
  })),
  setDecisions: jest.fn(async (input: { applicant_ids: string[] }) => ({
    ok: true, updated: input.applicant_ids.length,
  })),
};
jest.mock("@/features/03-recruitment-ats/lib/store", () => ({
  getSnapshot: (...a: unknown[]) => stub.getSnapshot(...(a as [])),
  setDecisions: (...a: unknown[]) => stub.setDecisions(...(a as [never])),
}));

import { NextRequest } from "next/server";
import { POST as bulkPOST } from "@/features/03-recruitment-ats/app/api/recruitment/decisions/bulk/route";

const ROLES = ["exec", "project_manager", "senior_consultant", "returning_member", "member"] as const;

function signInAs(role: (typeof ROLES)[number] | null, email = "exec@illinois.edu") {
  mockSession = role ? { user: { email, role } } : null;
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/recruitment/decisions/bulk", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => { jest.clearAllMocks(); signInAs("exec"); });

describe("who may bulk-decide", () => {
  it.each(ROLES)("%s", async (role) => {
    signInAs(role);
    const res = await bulkPOST(post({ applicant_ids: ["app-bob"], stage: "rejected" }));
    // Same gate as the single-applicant route: exec only.
    expect(res.status).toBe(role === "exec" ? 200 : 403);
  });

  it("refuses anonymous callers", async () => {
    signInAs(null);
    expect((await bulkPOST(post({ applicant_ids: ["app-bob"], stage: "rejected" }))).status).toBe(401);
  });
});

describe("validation", () => {
  it("rejects a non-array of ids", async () => {
    const res = await bulkPOST(post({ applicant_ids: "app-bob", stage: "rejected" }));
    expect(res.status).toBe(400);
    expect(stub.setDecisions).not.toHaveBeenCalled();
  });

  it("rejects an empty selection rather than silently doing nothing", async () => {
    const res = await bulkPOST(post({ applicant_ids: [], stage: "rejected" }));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown stage", async () => {
    const res = await bulkPOST(post({ applicant_ids: ["app-bob"], stage: "banished" }));
    expect(res.status).toBe(400);
    expect(stub.setDecisions).not.toHaveBeenCalled();
  });

  it("refuses a runaway batch", async () => {
    // A guard against a client bug rewriting a whole cohort, not a policy limit.
    const many = Array.from({ length: 251 }, (_, i) => `id-${i}`);
    const res = await bulkPOST(post({ applicant_ids: many, stage: "rejected" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/limit is 250/);
  });

  it("deduplicates ids before writing", async () => {
    await bulkPOST(post({ applicant_ids: ["app-bob", "app-bob", "app-cara"], stage: "rejected" }));
    expect(stub.setDecisions.mock.calls[0][0].applicant_ids).toEqual(["app-bob", "app-cara"]);
  });
});

describe("self-access", () => {
  it("drops the caller's own application from the batch and says so", async () => {
    // The case bulk actions exist to hide: nobody reads forty names before
    // confirming, so this has to be caught server-side.
    signInAs("exec", JANE);
    const res = await bulkPOST(post({ applicant_ids: ["app-jane", "app-bob"], stage: "rejected" }));
    expect(res.status).toBe(200);
    expect(stub.setDecisions.mock.calls[0][0].applicant_ids).toEqual(["app-bob"]);
    expect(await res.json()).toMatchObject({ updated: 1, skippedSelf: 1 });
  });

  it("refuses outright when the ONLY selection was the caller's own", async () => {
    // Succeeding with nothing done would read as "it worked".
    signInAs("exec", JANE);
    const res = await bulkPOST(post({ applicant_ids: ["app-jane"], stage: "rejected" }));
    expect(res.status).toBe(403);
    expect(stub.setDecisions).not.toHaveBeenCalled();
  });
});

describe("applying the decision", () => {
  it("moves everything selected and reports the count", async () => {
    const res = await bulkPOST(post({ applicant_ids: ["app-bob", "app-cara"], stage: "rejected" }));
    expect(await res.json()).toMatchObject({ ok: true, stage: "rejected", updated: 2 });
    expect(stub.setDecisions.mock.calls[0][0]).toMatchObject({
      stage: "rejected",
      decided_by: "exec@illinois.edu",
    });
  });

  it("works for advancing too, not only rejection", async () => {
    const res = await bulkPOST(post({ applicant_ids: ["app-bob"], stage: "interview" }));
    expect(await res.json()).toMatchObject({ ok: true, stage: "interview" });
  });

  it("reports ids that no longer exist instead of hiding the difference", async () => {
    // A tab open a while can hold ids that have since been deleted; a count that
    // quietly differs from the selection is how people lose track of what
    // actually happened.
    stub.setDecisions.mockResolvedValueOnce({ ok: true, updated: 1 });
    const res = await bulkPOST(post({ applicant_ids: ["app-bob", "app-cara"], stage: "rejected" }));
    expect(await res.json()).toMatchObject({ updated: 1, notFound: 1 });
  });
});
