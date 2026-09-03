/**
 * "You never see your own application", enforced at the route boundary.
 *
 * lib/self-access.ts has its own unit tests for the predicates. This suite is
 * about the thing that actually protects a member: that the REAL handlers apply
 * them, on reads and on writes, with no role able to opt out.
 *
 * The scenario throughout: Jane applied in fa26, was scored, and is a member
 * now — in some tests an exec. Her application row and the marks on it are the
 * one thing the pipeline must withhold from exactly one person.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSession: { user: { email: string; role: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

// Only the DB-backed setting is faked. `resolveCycle` keeps the REAL
// `normalizeCycle`, mirroring the actual implementation
// (`normalizeCycle(requested) ?? getActiveCycle()`) — a mock that just passed
// the query string through would let "garbage" reach the store and would assert
// nothing about the fallback that exists to stop exactly that.
jest.mock("@/features/03-recruitment-ats/lib/visibility", () => {
  const { normalizeCycle } = jest.requireActual("@/features/03-recruitment-ats/lib/cycle");
  return {
    canViewRecruiting: jest.fn(async () => true),
    getActiveCycle: jest.fn(async () => "fa26"),
    resolveCycle: jest.fn(async (c: string | null) => normalizeCycle(c) ?? "fa26"),
  };
});

const JANE = "jane@illinois.edu";
const BOB = "bob@illinois.edu";

/** Coverage rows as the store returns them — Jane's own application included. */
const COVERAGE_ROWS = [
  {
    applicant_id: "app-jane",
    name: "Jane Doe",
    email: JANE,
    stage: "applied",
    assigned: ["sam@illinois.edu", "amy@illinois.edu"],
    reviewed: ["sam@illinois.edu"],
    outstanding: ["amy@illinois.edu"],
    underAssigned: false,
    underReviewed: true,
  },
  {
    applicant_id: "app-bob",
    name: "Bob Smith",
    email: BOB,
    stage: "applied",
    assigned: ["sam@illinois.edu"],
    reviewed: [],
    outstanding: ["sam@illinois.edu"],
    underAssigned: true,
    underReviewed: true,
  },
];

/** Jane holds two applications on one email; Bob is somebody else entirely. */
const APPLICANTS = [
  {
    id: "app-jane",
    created_at: "2026-09-01T00:00:00Z",
    name: "Jane Doe",
    email: JANE,
    responses: {},
    stage: "applied",
    cycle: "fa26",
  },
  {
    id: "app-jane-old",
    created_at: "2026-02-01T00:00:00Z",
    name: "Jane Doe",
    email: "JANE@illinois.edu", // stored with different casing on purpose
    responses: {},
    stage: "rejected",
    cycle: "sp26",
  },
  {
    id: "app-bob",
    created_at: "2026-09-01T00:00:00Z",
    name: "Bob Smith",
    email: BOB,
    responses: {},
    stage: "applied",
    cycle: "fa26",
  },
];

/** Two reviewers scored Jane. This is the payload she must never receive. */
const REVIEWS = [
  {
    id: "r1",
    created_at: "2026-09-02T00:00:00Z",
    applicant_id: "app-jane",
    reviewer_email: "sam@illinois.edu",
    scores: { essay_1: 2, essay_2: 1, essay_3: 1, case_essay: 2, misc: 2, resume: 3 },
    weighted_total: 11,
    notes: "Case essay never lands an answer.",
    kind: "screen" as const,
  },
  {
    id: "r2",
    created_at: "2026-09-02T00:00:00Z",
    applicant_id: "app-bob",
    reviewer_email: "sam@illinois.edu",
    scores: { essay_1: 5, essay_2: 3, essay_3: 3, case_essay: 6, misc: 4, resume: 5 },
    weighted_total: 26,
    notes: "Top of the pool.",
    kind: "screen" as const,
  },
];

const stub = {
  getCoverage: jest.fn(async () => ({ ok: true, rows: COVERAGE_ROWS })),
  listCycles: jest.fn(async () => ["fa26", "sp26"]),
  getSnapshot: jest.fn(async () => ({
    applicants: APPLICANTS,
    reviews: REVIEWS,
    flags: [],
    pendingFlags: [],
    demo: false,
  })),
  getAssignments: jest.fn(async () => [
    { applicant_id: "app-jane", reviewer_email: JANE },
    { applicant_id: "app-bob", reviewer_email: JANE },
  ]),
  submitReview: jest.fn(async () => ({ ok: true })),
  setDecision: jest.fn(async () => ({ ok: true })),
};
jest.mock("@/features/03-recruitment-ats/lib/store", () => ({
  getCoverage: (...a: unknown[]) => stub.getCoverage(...(a as [])),
  getSnapshot: (...a: unknown[]) => stub.getSnapshot(...(a as [])),
  listCycles: (...a: unknown[]) => stub.listCycles(...(a as [])),
  getAssignments: (...a: unknown[]) => stub.getAssignments(...(a as [])),
  submitReview: (...a: unknown[]) => stub.submitReview(...(a as [])),
  setDecision: (...a: unknown[]) => stub.setDecision(...(a as [])),
}));

/** Jane's own applications, in both cycles; everything else is somebody else's.
 *  Only the DB lookup is stubbed — the email comparison stays real, so the
 *  assertions below are about data being withheld rather than about a route
 *  calling a particular function. */
jest.mock("@/features/03-recruitment-ats/lib/self-access-store", () => ({
  isOwnApplicationId: jest.fn(
    async (id: string, email: string) =>
      ["app-jane", "app-jane-old"].includes(id) &&
      (email ?? "").toLowerCase() === "jane@illinois.edu"
  ),
}));

const resumeStub = {
  getResumePointer: jest.fn(async () => ({
    fileId: "drive-file-1",
    name: "Resume — Jane Doe.pdf",
    mime: "application/pdf",
    match: "form",
    linkedAt: "2026-09-01T00:00:00Z",
  })),
};
const rubricStub = { saveRubric: jest.fn(async () => ({ ok: true })) };
jest.mock("@/features/03-recruitment-ats/lib/interview-store", () => ({
  getResumePointer: (...a: unknown[]) => resumeStub.getResumePointer(...(a as [])),
  saveRubric: (...a: unknown[]) => rubricStub.saveRubric(...(a as [])),
}));

const driveStub = {
  fetchResumeBytes: jest.fn(async () => ({
    ok: true as const,
    bytes: new Uint8Array([1, 2, 3]),
    mime: "application/pdf",
  })),
};
jest.mock("@/features/03-recruitment-ats/lib/drive", () => ({
  fetchResumeBytes: (...a: unknown[]) => driveStub.fetchResumeBytes(...(a as [])),
}));

import { NextRequest } from "next/server";
import { GET as coverageGET } from "@/features/03-recruitment-ats/app/api/recruitment/coverage/route";
import { GET as resumeGET } from "@/features/03-recruitment-ats/app/api/recruitment/resume/[id]/route";
import { GET as applicantsGET } from "@/features/03-recruitment-ats/app/api/recruitment/applicants/route";
import { POST as reviewsPOST } from "@/features/03-recruitment-ats/app/api/recruitment/reviews/route";
import { POST as rubricPOST } from "@/features/03-recruitment-ats/app/api/recruitment/interview/rubric/route";
import {
  GET as decisionsGET,
  POST as decisionsPOST,
} from "@/features/03-recruitment-ats/app/api/recruitment/decisions/route";

// The FLAGS route's self-access cases live in flags.test.ts, which already owns
// that route's other cases and its mocks. Kept in one place on purpose: two
// independent copies of a privacy assertion drift, and the one that rots is the
// one nobody is looking at.

/** Every role, so "no exec bypass" is asserted rather than assumed. */
const ROLES = ["exec", "project_manager", "senior_consultant", "returning_member", "member"] as const;

function signInAs(role: (typeof ROLES)[number] | null, email = JANE) {
  mockSession = role ? { user: { email, role } } : null;
}

function get(url = "http://localhost/api/recruitment/coverage") {
  return new NextRequest(url);
}

function post(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

/** A complete, in-range written-rubric payload, so a refusal is never a 400. */
const VALID_SCORES = { essay_1: 4, essay_2: 2, essay_3: 2, case_essay: 5, misc: 3, resume: 4 };

beforeEach(() => jest.clearAllMocks());

// ── Reading a resume ─────────────────────────────────────────────────────────

describe("GET /api/recruitment/resume/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it.each(["exec", "project_manager", "senior_consultant", "returning_member"] as const)(
    "refuses %s their own resume",
    async (role) => {
      // No exec bypass. Exec is listed first deliberately: exec is the role most
      // likely to have applied years ago and is the one every other gate lets
      // through.
      signInAs(role);
      const res = await resumeGET(get(), ctx("app-jane"));
      expect(res.status).toBe(403);
      // And the refusal happens BEFORE any Drive traffic — no bytes fetched, so
      // the file never leaves the service account even momentarily.
      expect(driveStub.fetchResumeBytes).not.toHaveBeenCalled();
      expect(resumeStub.getResumePointer).not.toHaveBeenCalled();
    }
  );

  it("still streams somebody else's resume", async () => {
    signInAs("project_manager");
    const res = await resumeGET(get(), ctx("app-bob"));
    expect(res.status).toBe(200);
    expect(driveStub.fetchResumeBytes).toHaveBeenCalled();
  });

  it("survives a non-Latin-1 filename", async () => {
    // Header values are ByteStrings, so an em dash or an accent used to make
    // NextResponse throw and turn the download into a 500. Not an edge case:
    // `resumeFileName()` builds every provisioned copy as "Resume — Name.pdf".
    resumeStub.getResumePointer.mockResolvedValueOnce({
      fileId: "drive-file-2",
      name: "Resume — José Álvarez.pdf",
      mime: "application/pdf",
      match: "form",
      linkedAt: "2026-09-01T00:00:00Z",
    });
    signInAs("project_manager");
    const res = await resumeGET(get(), ctx("app-bob"));

    expect(res.status).toBe(200);
    const disposition = res.headers.get("content-disposition") ?? "";
    // An ASCII-safe fallback for clients that only read `filename`…
    expect(disposition).toMatch(/filename="Resume _ Jos_ _lvarez\.pdf"/);
    // …and the real name, percent-encoded, for everything else (RFC 6266).
    expect(disposition).toContain("filename*=UTF-8''");
    expect(decodeURIComponent(disposition.split("filename*=UTF-8''")[1])).toBe(
      "Resume — José Álvarez.pdf"
    );
  });

  it("explains the refusal rather than reading like a bug", async () => {
    signInAs("exec");
    const res = await resumeGET(get(), ctx("app-jane"));
    expect((await res.json()).error).toMatch(/your own application/i);
  });
});

// ── Reading coverage ─────────────────────────────────────────────────────────

describe("GET /api/recruitment/coverage", () => {
  it.each(ROLES)("hides %s's own application row", async (role) => {
    signInAs(role);
    const body = await (await coverageGET(get())).json();
    const emails = body.rows.map((r: { email: string }) => r.email);
    expect(emails).not.toContain(JANE);
    expect(emails).toContain(BOB);
  });

  it("never names the reviewers screening you", async () => {
    // A coverage row lists who is assigned and who still owes a review. That is
    // precisely the thing a blind screen exists to withhold.
    signInAs("member");
    const body = await (await coverageGET(get())).json();
    expect(JSON.stringify(body)).not.toContain("app-jane");
  });

  it("leaves the pool intact for someone who never applied", async () => {
    signInAs("member", "newcomer@illinois.edu");
    const body = await (await coverageGET(get())).json();
    expect(body.rows).toHaveLength(2);
  });

  it("counts the summary over what is actually shown", async () => {
    // Otherwise the header says "2 candidates need a reviewer" over a list of
    // one, and the missing one can never be chased.
    signInAs("member");
    const body = await (await coverageGET(get())).json();
    expect(body.rows).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

// ── The reviewer feed ────────────────────────────────────────────────────────

describe("GET /api/recruitment/applicants", () => {
  it.each(ROLES)("hides %s's own application from the roster", async (role) => {
    signInAs(role);
    const body = await (await applicantsGET()).json();
    const ids = body.applicants.map((r: { applicant: { id: string } }) => r.applicant.id);
    expect(ids).not.toContain("app-jane");
    expect(ids).toContain("app-bob");
  });

  it("hides every cycle's application, not just the closed one", async () => {
    // A member applying again while holding a role must not watch their own live
    // application being scored — a strictly worse leak than reading an old one.
    signInAs("member");
    const body = await (await applicantsGET()).json();
    const ids = body.applicants.map((r: { applicant: { id: string } }) => r.applicant.id);
    expect(ids).not.toContain("app-jane-old");
  });

  it("matches the viewer's email case-insensitively", async () => {
    // `app-jane-old` is stored as "JANE@illinois.edu"; the session is lowercase.
    signInAs("exec", "Jane@Illinois.edu");
    const body = await (await applicantsGET()).json();
    const emails = body.applicants.map((r: { applicant: { email: string } }) =>
      r.applicant.email.toLowerCase()
    );
    expect(emails).not.toContain(JANE);
  });

  it("never ships the scores or notes written about the viewer", async () => {
    // The actual payload check: not just "the row is gone" but "the marks and
    // the reviewer's words are nowhere in the response".
    signInAs("exec");
    const raw = JSON.stringify(await (await applicantsGET()).json());
    expect(raw).not.toContain("Case essay never lands an answer.");
    expect(raw).not.toContain("app-jane");
  });

  it("still shows the viewer everybody else, with their aggregates", async () => {
    signInAs("member");
    const body = await (await applicantsGET()).json();
    expect(body.applicants).toHaveLength(1);
    expect(body.applicants[0].applicant.id).toBe("app-bob");
    expect(body.applicants[0].mean).toBe(26);
  });

  it("does not count a hidden application in the viewer's own queue", async () => {
    // Jane is assigned to herself in the fixture, which planAssignments would
    // never produce but an exec override could. Her progress must not include a
    // row she cannot open, or it can never reach done.
    signInAs("exec");
    const body = await (await applicantsGET()).json();
    expect(body.progress.assigned).toBe(1);
  });

  it("keeps the funnel over the full cohort", async () => {
    // Deliberate, and the opposite of the coverage summary: a funnel is a
    // reporting number and should be right — "3 people applied" says nothing
    // about whether you are one of them — whereas coverage is a to-do list and
    // has to match the rows you can act on.
    signInAs("member");
    const body = await (await applicantsGET()).json();
    const applied = body.funnel.find((f: { stage: string }) => f.stage === "applied");
    expect(applied.count).toBe(2); // app-jane + app-bob, though only one is listed
  });
});

// ── Scoring ──────────────────────────────────────────────────────────────────

describe("POST /api/recruitment/reviews", () => {
  const url = "http://localhost/api/recruitment/reviews";

  it.each(["exec", "project_manager", "senior_consultant", "returning_member"] as const)(
    "refuses %s scoring their own application",
    async (role) => {
      // Exec first on purpose: `canReviewApplicant` lets exec bypass assignment
      // entirely, so exec is the one role for which nothing else would stop this.
      signInAs(role);
      const res = await reviewsPOST(post(url, { applicant_id: "app-jane", scores: VALID_SCORES }));
      expect(res.status).toBe(403);
      expect(stub.submitReview).not.toHaveBeenCalled();
    }
  );

  it("refuses even though the viewer is assigned to it", async () => {
    // Assignment is what normally authorizes a review. It does not authorize
    // this one, so the self check has to sit ahead of the assignment check.
    signInAs("project_manager");
    const res = await reviewsPOST(post(url, { applicant_id: "app-jane", scores: VALID_SCORES }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/your own application/i);
  });

  it("still lets an assigned reviewer score somebody else", async () => {
    signInAs("project_manager");
    const res = await reviewsPOST(post(url, { applicant_id: "app-bob", scores: VALID_SCORES }));
    expect(res.status).toBe(200);
    expect(stub.submitReview).toHaveBeenCalled();
  });

  it("reports a malformed payload as 400 rather than as a self-access refusal", async () => {
    // Validation runs first, so the caller is told what is actually wrong.
    signInAs("exec");
    const res = await reviewsPOST(post(url, { applicant_id: "app-jane", scores: { essay_1: 99 } }));
    expect(res.status).toBe(400);
  });
});

// ── Deciding ─────────────────────────────────────────────────────────────────

describe("/api/recruitment/decisions", () => {
  const url = "http://localhost/api/recruitment/decisions";

  it("refuses exec setting a stage on their own application", async () => {
    // The route is already exec-only, which is precisely why this matters: the
    // only person who can reach it for their own row is an exec who applied, and
    // advancing yourself to `offer` is the worst thing this endpoint can do.
    signInAs("exec");
    const res = await decisionsPOST(post(url, { applicant_id: "app-jane", stage: "offer" }));
    expect(res.status).toBe(403);
    expect(stub.setDecision).not.toHaveBeenCalled();
  });

  it("refuses on an older cycle's application too", async () => {
    signInAs("exec");
    const res = await decisionsPOST(post(url, { applicant_id: "app-jane-old", stage: "offer" }));
    expect(res.status).toBe(403);
    expect(stub.setDecision).not.toHaveBeenCalled();
  });

  it("still lets exec decide on somebody else", async () => {
    signInAs("exec");
    const res = await decisionsPOST(post(url, { applicant_id: "app-bob", stage: "screened" }));
    expect(res.status).toBe(200);
    expect(stub.setDecision).toHaveBeenCalled();
  });

  it("hides the viewer's own row from the UNBLINDED decision queue", async () => {
    // This queue carries both reviewers' totals and both sets of written notes
    // side by side — the single worst row to hand somebody about themselves.
    signInAs("exec");
    const body = await (await decisionsGET(new NextRequest(url))).json();
    const ids = body.rows.map((r: { applicant: { id: string } }) => r.applicant.id);
    expect(ids).not.toContain("app-jane");
    expect(ids).toContain("app-bob");
    expect(JSON.stringify(body)).not.toContain("Case essay never lands an answer.");
  });

  it.each(ROLES)("refuses %s the single-candidate verdict lookup on their own row", async (role) => {
    // `?applicant_id=` is the feedback lookup: it reaches candidates the queue
    // above has already dropped, at any stage. That reach is the point AND the
    // risk — it is the one route that will happily fetch a rejected application
    // by id, and Jane's own rejection from sp26 is exactly such a row.
    signInAs(role);
    const res = await decisionsGET(
      new NextRequest(`${url}?cycle=sp26&applicant_id=app-jane-old`)
    );
    expect(res.status).toBe(403);
    expect(JSON.stringify(await res.json())).not.toContain("Case essay never lands an answer.");
  });

  it("still lets exec look up somebody else's verdicts for feedback", async () => {
    signInAs("exec");
    const res = await decisionsGET(new NextRequest(`${url}?applicant_id=app-bob`));
    expect(res.status).toBe(200);
    expect((await res.json()).row.applicant.id).toBe("app-bob");
  });
});

// ── Interview rubrics ────────────────────────────────────────────────────────

describe("POST /api/recruitment/interview/rubric", () => {
  const url = "http://localhost/api/recruitment/interview/rubric";
  // What an interviewer submits: the total off the paper case sheet, out of 15.
  const CASE_SCORES = { total: 11 };

  /**
   * The whole point of opening interviews up: a plain member, on no panel, can
   * record a first-round score. This asserts it through the ROUTE rather than
   * the predicate, because the predicate was never what blocked them — a second
   * role list in interview.ts rejected the request several lines earlier, and a
   * unit test on `canInterviewRole` alone would have passed the entire time the
   * feature was broken.
   */
  it("lets a plain member score a first-round interview", async () => {
    signInAs("member");
    const res = await rubricPOST(
      post(url, { applicant_id: "app-bob", kind: "case", scores: CASE_SCORES })
    );
    expect(res.status).toBe(200);
    expect(rubricStub.saveRubric).toHaveBeenCalled();
  });

  it("accepts a half point and stores it unrounded", async () => {
    signInAs("member");
    const res = await rubricPOST(
      post(url, { applicant_id: "app-bob", kind: "case", scores: { total: 11.5 } })
    );
    expect(res.status).toBe(200);
    expect(rubricStub.saveRubric).toHaveBeenCalledWith(
      expect.objectContaining({ scores: { total: 11.5 } })
    );
  });

  it("refuses a finer slice than a half point", async () => {
    signInAs("member");
    const res = await rubricPOST(
      post(url, { applicant_id: "app-bob", kind: "case", scores: { total: 11.25 } })
    );
    expect(res.status).toBe(400);
    expect(rubricStub.saveRubric).not.toHaveBeenCalled();
  });

  it("still refuses a plain member the final round", async () => {
    signInAs("member");
    const res = await rubricPOST(
      post(url, { applicant_id: "app-bob", kind: "final_case", scores: CASE_SCORES })
    );
    expect(res.status).toBe(403);
    expect(rubricStub.saveRubric).not.toHaveBeenCalled();
  });

  it.each(["exec", "project_manager", "senior_consultant", "returning_member", "member"] as const)(
    "refuses %s scoring their own interview",
    async (role) => {
      // `saveRubric` gates on panel membership, but exec is handed `bypassPanel`,
      // so panel membership is not what stops this for the role that matters.
      signInAs(role);
      const res = await rubricPOST(
        post(url, { applicant_id: "app-jane", kind: "case", scores: CASE_SCORES })
      );
      expect(res.status).toBe(403);
      expect(rubricStub.saveRubric).not.toHaveBeenCalled();
    }
  );

  it("gives the self-access reason, not the final-round one", async () => {
    // The check sits ahead of the round gate on purpose: a candidate should be
    // told this is their own application, not that the final round is exec-only.
    signInAs("project_manager");
    const res = await rubricPOST(
      post(url, { applicant_id: "app-jane", kind: "final_case", scores: CASE_SCORES })
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/your own application/i);
  });

  it("still lets a panelist score somebody else", async () => {
    signInAs("project_manager");
    const res = await rubricPOST(
      post(url, { applicant_id: "app-bob", kind: "case", scores: CASE_SCORES })
    );
    expect(res.status).toBe(200);
    expect(rubricStub.saveRubric).toHaveBeenCalled();
  });
});

// ── Cycle scoping ────────────────────────────────────────────────────────────
//
// Lives in this file rather than cycle-store.test.ts because it is a ROUTE-level
// assertion and needs the mocked store above; cycle-store.test.ts deliberately
// runs against the real store on the demo path.
//
// The third argument is the viewer's ROLE, which `getSnapshot` needs only to
// stamp each flag with whether this reader may remove it (see `presentFlags`).
// It is asserted here because these are the calls that carry it: a route that
// dropped it would silently hide the Remove button from every exec.

describe("the console shows one cycle at a time", () => {
  const url = "http://localhost/api/recruitment/applicants";

  it("defaults to the cycle recruiting is running", async () => {
    signInAs("member", "newcomer@illinois.edu");
    await applicantsGET();
    expect(stub.getSnapshot).toHaveBeenCalledWith("fa26", "newcomer@illinois.edu", "member");
  });

  it("opens a past cohort on request", async () => {
    // The point of storing a cycle per application rather than clearing the
    // table each semester: last year's cohort stays readable.
    signInAs("exec", "newcomer@illinois.edu");
    await applicantsGET(new NextRequest(`${url}?cycle=sp26`));
    expect(stub.getSnapshot).toHaveBeenCalledWith("sp26", "newcomer@illinois.edu", "exec");
  });

  it("falls back to the active cycle on a nonsense cycle", async () => {
    // A stale bookmark or a typo should show the current cohort, not a 400.
    signInAs("member", "newcomer@illinois.edu");
    await applicantsGET(new NextRequest(`${url}?cycle=garbage`));
    expect(stub.getSnapshot).toHaveBeenCalledWith("fa26", "newcomer@illinois.edu", "member");
  });

  it("names the cohort and offers the others", async () => {
    // So the console can say "Fall 2026" above the list, instead of showing an
    // undated pool that silently changes meaning at the turn of a semester.
    signInAs("member", "newcomer@illinois.edu");
    const body = await (await applicantsGET()).json();
    expect(body.cycle).toBe("fa26");
    expect(body.cycleLabel).toBe("Fall 2026");
    expect(body.cycles).toEqual([
      { cycle: "fa26", label: "Fall 2026" },
      { cycle: "sp26", label: "Spring 2026" },
    ]);
  });

  it("scopes the decision queue the same way", async () => {
    signInAs("exec", "newcomer@illinois.edu");
    const res = await decisionsGET(
      new NextRequest("http://localhost/api/recruitment/decisions?cycle=sp26")
    );
    expect(stub.getSnapshot).toHaveBeenCalledWith("sp26", "newcomer@illinois.edu", "exec");
    expect((await res.json()).cycle).toBe("sp26");
  });
});
