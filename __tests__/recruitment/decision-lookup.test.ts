/**
 * Looking a decided candidate's written reviews back up, after the fact.
 *
 * The decision queue is a WORK LIST: a candidate drops out of it the moment exec
 * rejects or advances them. That is right for the queue and wrong for everything
 * after it — a rejected applicant writes in asking why two weeks later, and the
 * two rubrics that produced the call are the only honest answer available. Until
 * `?applicant_id=` existed the marks were still in the database with no surface
 * left that showed them.
 *
 * So the property under test is a pair: the queue still drops decided candidates,
 * AND the single-candidate lookup still finds them.
 */

let mockSession: { user: { email: string; role: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

jest.mock("@/features/03-recruitment-ats/lib/visibility", () => {
  const { normalizeCycle } = jest.requireActual("@/features/03-recruitment-ats/lib/cycle");
  return {
    canViewRecruiting: jest.fn(async () => true),
    getActiveCycle: jest.fn(async () => "fa26"),
    resolveCycle: jest.fn(async (c: string | null) => normalizeCycle(c) ?? "fa26"),
  };
});

jest.mock("@/features/03-recruitment-ats/lib/self-access-store", () => ({
  isOwnApplicationId: jest.fn(async () => false),
}));

const EXEC = "chair@illinois.edu";

/** One of each: still being decided, rejected, and advanced into the first
 *  round. The last two are exactly what the queue is supposed to have dropped. */
const APPLICANTS = [
  { id: "app-open", created_at: "2026-09-01T00:00:00Z", name: "Open Oliver", email: "oliver@illinois.edu", responses: {}, stage: "applied", cycle: "fa26" },
  { id: "app-rejected", created_at: "2026-09-01T00:00:00Z", name: "Rejected Rita", email: "rita@illinois.edu", responses: {}, stage: "rejected", cycle: "fa26" },
  { id: "app-advanced", created_at: "2026-09-01T00:00:00Z", name: "Advanced Ana", email: "ana@illinois.edu", responses: {}, stage: "interview", cycle: "fa26" },
];

/** Rita's two readers disagreed hard — 11 against 25, a 14-point spread. The
 *  mean of those is an unremarkable 18, which is precisely why feedback has to
 *  quote the two reads rather than the average. */
const REVIEWS = [
  {
    id: "r-rita-1", created_at: "2026-09-02T00:00:00Z", applicant_id: "app-rejected",
    reviewer_email: "sam@illinois.edu",
    scores: { essay_1: 2, essay_2: 1, essay_3: 1, case_essay: 2, misc: 2, resume: 3 },
    weighted_total: 11, notes: "Case essay never lands an answer.", kind: "screen" as const,
  },
  {
    id: "r-rita-2", created_at: "2026-09-02T00:00:00Z", applicant_id: "app-rejected",
    reviewer_email: "amy@illinois.edu",
    scores: { essay_1: 5, essay_2: 3, essay_3: 3, case_essay: 6, misc: 3, resume: 5 },
    weighted_total: 25, notes: "Strongest resume in my batch.", kind: "screen" as const,
  },
  {
    id: "r-ana-1", created_at: "2026-09-02T00:00:00Z", applicant_id: "app-advanced",
    reviewer_email: "sam@illinois.edu",
    scores: { essay_1: 5, essay_2: 3, essay_3: 3, case_essay: 6, misc: 4, resume: 5 },
    weighted_total: 26, notes: "Top of the pool.", kind: "screen" as const,
  },
  // An INTERVIEW rubric on the same candidate. Scored on a different scale
  // entirely, and must not be folded into a written verdict.
  {
    id: "r-ana-case", created_at: "2026-09-20T00:00:00Z", applicant_id: "app-advanced",
    reviewer_email: "sam@illinois.edu",
    scores: { structure: 4, quantitative: 4, business_judgment: 3, synthesis: 4 },
    weighted_total: 15, notes: "Strong case.", kind: "case" as const,
  },
];

const stub = {
  getSnapshot: jest.fn(async () => ({
    applicants: APPLICANTS, reviews: REVIEWS, flags: [], pendingFlags: [], demo: false,
  })),
  setDecision: jest.fn(async () => ({ ok: true })),
};
jest.mock("@/features/03-recruitment-ats/lib/store", () => ({
  getSnapshot: (...a: unknown[]) => stub.getSnapshot(...(a as [])),
  setDecision: (...a: unknown[]) => stub.setDecision(...(a as [])),
}));

import { NextRequest } from "next/server";
import { GET } from "@/features/03-recruitment-ats/app/api/recruitment/decisions/route";
import type { DecisionRow } from "@/features/03-recruitment-ats/lib/decision";

function signInAs(role: string | null, email = EXEC) {
  mockSession = role ? { user: { email, role } } : null;
}

function get(query = "") {
  return GET(new NextRequest(`http://localhost/api/recruitment/decisions${query}`));
}

beforeEach(() => {
  jest.clearAllMocks();
  signInAs("exec");
});

describe("GET /api/recruitment/decisions?applicant_id=", () => {
  it("returns the written verdicts of somebody already rejected", async () => {
    const res = await get("?applicant_id=app-rejected");
    expect(res.status).toBe(200);
    const row: DecisionRow = (await res.json()).row;

    expect(row.applicant.name).toBe("Rejected Rita");
    expect(row.verdicts.map((v) => v.reviewer_email).sort()).toEqual([
      "amy@illinois.edu",
      "sam@illinois.edu",
    ]);
    // The notes are the whole point — a score with no reason is not feedback.
    expect(row.verdicts.map((v) => v.notes)).toEqual(
      expect.arrayContaining(["Case essay never lands an answer.", "Strongest resume in my batch."])
    );
  });

  it("carries the disagreement, so feedback is not given from the mean", async () => {
    const row: DecisionRow = (await (await get("?applicant_id=app-rejected")).json()).row;
    expect(row.mean).toBe(18);
    expect(row.spread).toBe(14);
    expect(row.disagreement).toBe(true);
  });

  it("finds a candidate advanced into the first round as well", async () => {
    const row: DecisionRow = (await (await get("?applicant_id=app-advanced")).json()).row;
    expect(row.verdicts).toHaveLength(1);
    // The interview rubric on the same candidate scores a different scale and is
    // not a written verdict.
    expect(row.verdicts[0].weighted_total).toBe(26);
    expect(row.verdicts.map((v) => v.notes)).not.toContain("Strong case.");
  });

  it("is the ONLY way to reach them — the queue itself still drops decided candidates", async () => {
    const body = await (await get("?ready=0")).json();
    const ids = body.rows.map((r: DecisionRow) => r.applicant.id);
    expect(ids).toEqual(["app-open"]);
    expect(JSON.stringify(body)).not.toContain("Case essay never lands an answer.");
  });

  it("stays exec-only, like every other read on this route", async () => {
    for (const role of ["project_manager", "senior_consultant", "returning_member", "member"]) {
      signInAs(role);
      expect((await get("?applicant_id=app-rejected")).status).toBe(403);
    }
    signInAs(null);
    expect((await get("?applicant_id=app-rejected")).status).toBe(401);
  });

  it("refuses the viewer's OWN application, with no exec bypass", async () => {
    // Rita, hypothetically, is on exec next cycle. The one payload in the app
    // that carries both readers' marks and both sets of notes about one person
    // is the one she must not be able to pull up about herself.
    signInAs("exec", "rita@illinois.edu");
    const res = await get("?applicant_id=app-rejected");
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("Case essay never lands an answer.");
  });

  it("404s on an id outside the cycle it was asked for", async () => {
    // Scoped like every other read here, so an id from one cohort cannot quietly
    // pull a row out of another.
    const res = await get("?applicant_id=app-nobody");
    expect(res.status).toBe(404);
  });
});
