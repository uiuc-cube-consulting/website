/**
 * Tests that strike submission sends emails to the correct recipients.
 *
 * The POST /api/strikes route has two paths:
 *  - Exec-filed strike: immediately approved, emails sent if email_subject/email_body provided
 *  - Non-exec-filed strike: stays pending, no emails sent
 */

import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSendEmail = jest.fn().mockResolvedValue({ id: "email-id" });
jest.mock("@/lib/email/send", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

let mockSession: Record<string, unknown> | null = null;
jest.mock("@/auth", () => ({
  auth: jest.fn(() => Promise.resolve(mockSession)),
}));

let mockSupabaseData: Record<string, unknown[]> = {};
const mockSupabaseInsertResult = { data: null as unknown, error: null as unknown };

const buildSupabaseChain = (tableName: string) => {
  const chain = {
    _table: tableName,
    _filters: {} as Record<string, unknown>,
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockImplementation(function (this: typeof chain, col: string, val: unknown) {
      chain._filters[col] = val;
      return chain;
    }),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockImplementation(() => {
      const table = chain._table;
      const rows = mockSupabaseData[table] ?? [];
      const filters = chain._filters;

      // Insert path: return the mocked insert result
      if (chain.insert.mock.calls.length > 0) {
        return Promise.resolve(mockSupabaseInsertResult);
      }

      // Filter rows by all eq() calls
      const matched = rows.filter((row) =>
        Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v)
      );
      return Promise.resolve({ data: matched[0] ?? null, error: null });
    }),
    // Awaitable for multi-row queries (select without single)
    then: jest.fn().mockImplementation((resolve: (v: unknown) => unknown) => {
      const table = chain._table;
      const rows = mockSupabaseData[table] ?? [];
      const filters = chain._filters;
      const matched = rows.filter((row) =>
        Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v)
      );
      return Promise.resolve({ data: matched, error: null }).then(resolve);
    }),
  };
  return chain;
};

jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(() => ({
    from: jest.fn((table: string) => buildSupabaseChain(table)),
  })),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/strikes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function execSession(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      memberId: "exec-member-id",
      role: "exec",
      name: "Exec User",
      email: "exec@cubeconsulting.org",
      ...overrides,
    },
  };
}

const TARGET_MEMBER = {
  id: "target-member-id",
  full_name: "Jane Doe",
  email: "jane@example.com",
};

const EXEC_MEMBERS = [
  { email: "exec1@cubeconsulting.org" },
  { email: "exec2@cubeconsulting.org" },
];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/strikes — email delivery on submission", () => {
  let POST: (req: NextRequest) => Promise<Response>;

  beforeAll(async () => {
    ({ POST } = await import("@/app/api/strikes/route"));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSession = null;
    mockSupabaseData = {};
    mockSupabaseInsertResult.data = null;
    mockSupabaseInsertResult.error = null;
  });

  // ── Auth guards ─────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    mockSession = null;
    const res = await POST(makeRequest({ target_member_id: "x", strike_type: "full", reason: "r" }));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 403 when role is not allowed to file strikes", async () => {
    mockSession = execSession({ role: "consultant" });
    const res = await POST(makeRequest({ target_member_id: "x", strike_type: "full", reason: "r" }));
    expect(res.status).toBe(403);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  // ── Exec-filed: email sent to struck member ─────────────────────────────────

  it("sends an email to the struck member when an exec submits with email content", async () => {
    mockSession = execSession();
    mockSupabaseData["members"] = [TARGET_MEMBER];
    mockSupabaseData["strikes"] = [];
    mockSupabaseInsertResult.data = { id: "strike-1", member_id: TARGET_MEMBER.id, status: "approved" };
    mockSupabaseInsertResult.error = null;

    const res = await POST(
      makeRequest({
        target_member_id: TARGET_MEMBER.id,
        strike_type: "full",
        reason: "Missed deliverable",
        email_subject: "[CUBE] Strike Notice",
        email_body: "<p>You have received a strike.</p>",
      })
    );

    expect(res.status).toBe(201);
    // Call 1: HR notice. Call 2: notice to the struck member.
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        to: TARGET_MEMBER.email,
        subject: "[CUBE] Strike Notice",
        html: expect.stringContaining("<p>You have received a strike.</p>"),
      })
    );
  });

  it("notifies HR whenever a strike is filed", async () => {
    mockSession = execSession();
    mockSupabaseData["members"] = [TARGET_MEMBER];
    mockSupabaseData["strikes"] = [];
    mockSupabaseInsertResult.data = { id: "strike-1", status: "approved" };

    await POST(
      makeRequest({
        target_member_id: TARGET_MEMBER.id,
        strike_type: "half",
        reason: "Late deliverable",
        email_subject: "[CUBE] Strike Notice",
        email_body: "<p>Half strike issued.</p>",
      })
    );

    expect(mockSendEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ to: "hr@cubeconsulting.org" })
    );
  });

  // ── Exec-filed: 400 when email content omitted ──────────────────────────────

  it("returns 400 (but still notifies HR) when exec omits email_subject/email_body", async () => {
    mockSession = execSession();
    mockSupabaseData["members"] = [TARGET_MEMBER];
    mockSupabaseData["strikes"] = [];
    mockSupabaseInsertResult.data = { id: "strike-1", status: "approved" };

    const res = await POST(
      makeRequest({
        target_member_id: TARGET_MEMBER.id,
        strike_type: "full",
        reason: "Missed meeting",
        // No email_subject or email_body
      })
    );

    expect(res.status).toBe(400);
    // The strike row is already inserted at this point, so HR still gets notified.
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@cubeconsulting.org" })
    );
  });

  // ── Non-exec-filed: pending, only HR is notified ────────────────────────────

  it("only notifies HR (no member email) when a project manager submits (strike is pending)", async () => {
    mockSession = execSession({ role: "project_manager" });
    mockSupabaseData["members"] = [TARGET_MEMBER];
    mockSupabaseData["strikes"] = [];
    mockSupabaseInsertResult.data = { id: "strike-1", status: "pending" };

    const res = await POST(
      makeRequest({
        target_member_id: TARGET_MEMBER.id,
        strike_type: "full",
        reason: "Code quality",
        email_subject: "[CUBE] Strike Notice",
        email_body: "<p>You may receive a strike.</p>",
      })
    );

    expect(res.status).toBe(201);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@cubeconsulting.org" })
    );
  });

  it("allows a senior consultant to file a strike, notifying only HR", async () => {
    mockSession = execSession({ role: "senior_consultant" });
    mockSupabaseData["members"] = [TARGET_MEMBER];
    mockSupabaseData["strikes"] = [];
    mockSupabaseInsertResult.data = { id: "strike-1", status: "pending" };

    const res = await POST(
      makeRequest({
        target_member_id: TARGET_MEMBER.id,
        strike_type: "half",
        reason: "Attitude issue",
        email_subject: "[CUBE] Strike Notice",
        email_body: "<p>Half strike submitted.</p>",
      })
    );

    expect(res.status).toBe(201);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@cubeconsulting.org" })
    );
  });

  // ── 3-strike exec alert ─────────────────────────────────────────────────────

  it("sends an exec alert when the struck member reaches 3 total strikes", async () => {
    mockSession = execSession();
    mockSupabaseData["members"] = [
      TARGET_MEMBER,
      ...EXEC_MEMBERS.map((e, i) => ({
        id: `exec-${i}`,
        full_name: `Exec ${i}`,
        email: e.email,
        role: "exec",
      })),
    ];
    // Member already has 2 approved full strikes → adding 1 more hits 3.
    // member_id must be present so the .eq("member_id", ...) filter matches.
    mockSupabaseData["strikes"] = [
      { member_id: TARGET_MEMBER.id, effective_type: "full", status: "approved" },
      { member_id: TARGET_MEMBER.id, effective_type: "full", status: "approved" },
      { member_id: TARGET_MEMBER.id, effective_type: "full", status: "approved" },
    ];
    mockSupabaseInsertResult.data = { id: "strike-3", status: "approved" };

    const res = await POST(
      makeRequest({
        target_member_id: TARGET_MEMBER.id,
        strike_type: "full",
        reason: "Third violation",
        email_subject: "[CUBE] Strike Notice — 3rd Strike",
        email_body: "<p>Third strike issued.</p>",
      })
    );

    expect(res.status).toBe(201);

    // Call 1: HR notice. Call 2: email to struck member. Call 3: exec alert.
    expect(mockSendEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ to: TARGET_MEMBER.email })
    );

    expect(mockSendEmail).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        to: expect.arrayContaining(EXEC_MEMBERS.map((e) => e.email)),
        subject: expect.stringContaining("3-Strike"),
      })
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(3);
  });

  it("does NOT send an exec alert when the struck member has fewer than 3 strikes", async () => {
    mockSession = execSession();
    mockSupabaseData["members"] = [TARGET_MEMBER];
    // Only 1 approved strike total after insertion
    mockSupabaseData["strikes"] = [{ effective_type: "full", status: "approved" }];
    mockSupabaseInsertResult.data = { id: "strike-1", status: "approved" };

    await POST(
      makeRequest({
        target_member_id: TARGET_MEMBER.id,
        strike_type: "full",
        reason: "First violation",
        email_subject: "[CUBE] Strike Notice",
        email_body: "<p>First strike.</p>",
      })
    );

    // HR notice + member email, no exec alert
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("3-Strike") })
    );
  });

  // ── Input validation ────────────────────────────────────────────────────────

  it("returns 400 and sends no email when required fields are missing", async () => {
    mockSession = execSession();
    const res = await POST(makeRequest({ strike_type: "full" })); // missing target_member_id and reason
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 400 and sends no email for an invalid strike_type", async () => {
    mockSession = execSession();
    const res = await POST(
      makeRequest({ target_member_id: TARGET_MEMBER.id, strike_type: "triple", reason: "bad" })
    );
    expect(res.status).toBe(400);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns 404 and sends no email when the target member does not exist", async () => {
    mockSession = execSession();
    mockSupabaseData["members"] = []; // no members in DB
    mockSupabaseInsertResult.data = null;

    const res = await POST(
      makeRequest({
        target_member_id: "nonexistent-id",
        strike_type: "full",
        reason: "Test",
        email_subject: "[CUBE] Strike",
        email_body: "<p>Strike</p>",
      })
    );

    expect(res.status).toBe(404);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
