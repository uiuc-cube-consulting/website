/**
 * Point submission routes — who may submit, who may review, who may see the
 * photo. Project managers, senior consultants, returning members and members
 * submit; only exec review; a photo is visible to the member who submitted it
 * and to exec, nobody else.
 */

import { NextRequest } from "next/server";
import type { CategoryTotals, SubmissionRow } from "@/lib/point-catalog";
import type {
  CreateResult,
  ListResult,
  ReviewResult,
  SubmissionWithEvidence,
} from "@/lib/point-submissions-store";

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSession: { user: { email: string; role: string; memberId: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

const LEDGER: CategoryTotals = { fundamentals: 1, professional: 2, social: 0 };

const store = {
  listSubmissions: jest.fn(async (_opts: { memberId?: string }): Promise<ListResult> => ({ ok: true, rows: [] })),
  createSubmission: jest.fn(
    async (input: Record<string, unknown>, _evidence: unknown): Promise<CreateResult> => ({
      ok: true,
      row: { ...row(), ...input } as SubmissionRow,
    })
  ),
  getSubmission: jest.fn(async (_id: string): Promise<SubmissionWithEvidence | null> => row()),
  reviewSubmission: jest.fn(
    async (_id: string, _reviewer: string, decision: string, _note: string | null, _reason: string): Promise<ReviewResult> => ({
      ok: true,
      outcome: decision,
    })
  ),
  ledgerCategoryTotals: jest.fn(async (_memberId: string): Promise<CategoryTotals> => LEDGER),
  downloadEvidence: jest.fn(async (_path: string): Promise<Uint8Array<ArrayBuffer> | null> => new Uint8Array([0xff, 0xd8, 0xff])),
};
jest.mock("@/lib/point-submissions-store", () => store);

import { GET as listRoute, POST as submitRoute } from "@/app/api/points/submissions/route";
import { POST as reviewRoute } from "@/app/api/points/submissions/[id]/review/route";
import { GET as evidenceRoute } from "@/app/api/points/submissions/[id]/evidence/route";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MEMBER = { email: "priya@illinois.edu", role: "member", memberId: "m-1" };
const OTHER = { email: "sam@illinois.edu", role: "senior_consultant", memberId: "m-2" };
const EXEC = { email: "exec@illinois.edu", role: "exec", memberId: "e-1" };

const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]).toString("base64")}`;

function row(over: Partial<SubmissionWithEvidence> = {}): SubmissionWithEvidence {
  return {
    id: "s-1",
    created_at: "2026-09-12T15:00:00.000Z",
    member_id: "m-1",
    member_name: "Priya Raman",
    member_email: "priya@illinois.edu",
    member_role: "member",
    category: "professional",
    event_key: "resume-review",
    event_label: "Resume review",
    points: 1,
    occurred_on: "2026-09-12",
    note: null,
    status: "pending",
    reviewed_at: null,
    review_note: null,
    reviewer_name: null,
    evidence_path: "m-1/abc.jpg",
    evidence_mime: "image/jpeg",
    ...over,
  };
}

function post(url: string, body: unknown) {
  return new NextRequest(`https://portal.test${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const params = (id = "s-1") => ({ params: Promise.resolve({ id }) });

function submit(body: Record<string, unknown> = {}) {
  return submitRoute(
    post("/api/points/submissions", { event_key: "resume-review", occurred_on: "2026-09-12", photo: JPEG, ...body })
  );
}

function review(body: Record<string, unknown>, id = "s-1") {
  return reviewRoute(post(`/api/points/submissions/${id}/review`, body), params(id));
}

function evidence(id = "s-1") {
  return evidenceRoute(new NextRequest(`https://portal.test/api/points/submissions/${id}/evidence`), params(id));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: MEMBER };
  store.listSubmissions.mockResolvedValue({ ok: true, rows: [] });
  store.getSubmission.mockResolvedValue(row());
  store.ledgerCategoryTotals.mockResolvedValue(LEDGER);
  store.downloadEvidence.mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff]));
  store.reviewSubmission.mockImplementation(async (_id, _reviewer, decision) => ({ ok: true, outcome: decision }));
});

// ── Submitting ───────────────────────────────────────────────────────────────

describe("POST /api/points/submissions", () => {
  it("requires a session", async () => {
    mockSession = null;
    expect((await submit()).status).toBe(401);
  });

  it.each(["project_manager", "senior_consultant", "returning_member", "member"])(
    "lets a %s submit",
    async (role) => {
      mockSession = { user: { ...MEMBER, role } };
      expect((await submit()).status).toBe(201);
      expect(store.createSubmission).toHaveBeenCalledTimes(1);
    }
  );

  it("refuses exec, who aren't on the points board", async () => {
    mockSession = { user: EXEC };
    expect((await submit()).status).toBe(403);
    expect(store.createSubmission).not.toHaveBeenCalled();
  });

  it("refuses a session with no role rather than treating it as a member", async () => {
    mockSession = { user: { ...MEMBER, role: "" } };
    expect((await submit()).status).toBe(403);
    expect(store.createSubmission).not.toHaveBeenCalled();
  });

  it("requires a photo", async () => {
    const res = await submit({ photo: undefined });
    expect(res.status).toBe(400);
    expect(store.createSubmission).not.toHaveBeenCalled();
  });

  it("takes the points, label and category from the catalog, not the request", async () => {
    const res = await submit({ event_key: "mock-case", points: 50, event_label: "Anything", category: "social" });
    expect(res.status).toBe(201);

    const [input, photo] = store.createSubmission.mock.calls[0];
    expect(input).toEqual({
      member_id: "m-1",
      category: "professional",
      event_key: "mock-case",
      event_label: "Mock case interview",
      points: 2,
      occurred_on: "2026-09-12",
      note: null,
    });
    expect(photo).toMatchObject({ mime: "image/jpeg" });
  });

  it("checks the repeat limit against the member's own submissions", async () => {
    store.listSubmissions.mockResolvedValue({ ok: true, rows: [row({ event_key: "linkedin-review", status: "approved" })] });
    const res = await submit({ event_key: "linkedin-review" });

    expect(store.listSubmissions).toHaveBeenCalledWith({ memberId: "m-1" });
    expect(res.status).toBe(409);
    expect(store.createSubmission).not.toHaveBeenCalled();
  });

  it("says the feature isn't set up when the table is missing", async () => {
    store.listSubmissions.mockResolvedValue({ ok: false, missing: true, error: "PGRST205" });
    const res = await submit();
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/point-submissions\.sql/);
  });
});

describe("GET /api/points/submissions", () => {
  it("gives a member only their own submissions, with their ledger totals per category", async () => {
    const res = await listRoute();
    expect(store.listSubmissions).toHaveBeenCalledWith({ memberId: "m-1" });
    expect(store.ledgerCategoryTotals).toHaveBeenCalledWith("m-1");
    expect(await res.json()).toMatchObject({ isExec: false, cohort: "new", ledgerTotals: LEDGER });
  });

  it("gives exec every submission and skips the per-member totals", async () => {
    mockSession = { user: EXEC };
    await listRoute();
    expect(store.listSubmissions).toHaveBeenCalledWith({});
    expect(store.ledgerCategoryTotals).not.toHaveBeenCalled();
  });

  it("still returns the ledger totals when the submissions table is missing", async () => {
    store.listSubmissions.mockResolvedValue({ ok: false, missing: true, error: "PGRST205" });
    expect(await (await listRoute()).json()).toMatchObject({ tableMissing: true, ledgerTotals: LEDGER });
  });
});

// ── Reviewing ────────────────────────────────────────────────────────────────

describe("POST /api/points/submissions/[id]/review", () => {
  it("is exec-only", async () => {
    for (const user of [MEMBER, OTHER]) {
      mockSession = { user };
      expect((await review({ decision: "approve" })).status).toBe(403);
    }
    expect(store.reviewSubmission).not.toHaveBeenCalled();
  });

  it("approves with the reviewer's id and a ledger reason naming the event", async () => {
    mockSession = { user: EXEC };
    const res = await review({ decision: "approve" });

    expect(res.status).toBe(200);
    expect(store.reviewSubmission).toHaveBeenCalledWith("s-1", "e-1", "approved", null, "Professional: Resume review");
  });

  it("requires a note to reject", async () => {
    mockSession = { user: EXEC };
    expect((await review({ decision: "reject", note: "  " })).status).toBe(400);

    const res = await review({ decision: "reject", note: "Photo doesn't show the meeting" });
    expect(res.status).toBe(200);
    expect(store.reviewSubmission).toHaveBeenCalledWith("s-1", "e-1", "rejected", "Photo doesn't show the meeting", expect.any(String));
  });

  it("refuses to review a submission twice", async () => {
    mockSession = { user: EXEC };
    store.getSubmission.mockResolvedValue(row({ status: "approved" }));
    expect((await review({ decision: "approve" })).status).toBe(409);
    expect(store.reviewSubmission).not.toHaveBeenCalled();
  });

  it("reports a race lost to another exec as a conflict", async () => {
    mockSession = { user: EXEC };
    store.reviewSubmission.mockResolvedValue({ ok: true, outcome: "already_approved" });
    expect((await review({ decision: "approve" })).status).toBe(409);
  });

  it("won't let exec review their own submission", async () => {
    mockSession = { user: EXEC };
    store.getSubmission.mockResolvedValue(row({ member_id: "e-1" }));
    expect((await review({ decision: "approve" })).status).toBe(403);
  });

  it("404s an unknown submission", async () => {
    mockSession = { user: EXEC };
    store.getSubmission.mockResolvedValue(null);
    expect((await review({ decision: "approve" })).status).toBe(404);
  });
});

// ── The photo ────────────────────────────────────────────────────────────────

describe("GET /api/points/submissions/[id]/evidence", () => {
  it("serves the member who submitted it", async () => {
    const res = await evidence();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("serves exec", async () => {
    mockSession = { user: EXEC };
    expect((await evidence()).status).toBe(200);
  });

  it("refuses any other member", async () => {
    mockSession = { user: OTHER };
    expect((await evidence()).status).toBe(403);
    expect(store.downloadEvidence).not.toHaveBeenCalled();
  });

  it("never echoes a tampered mime type into Content-Type", async () => {
    store.getSubmission.mockResolvedValue(row({ evidence_mime: "text/html" }));
    expect((await evidence()).headers.get("content-type")).toBe("application/octet-stream");
  });
});
