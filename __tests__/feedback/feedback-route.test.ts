/**
 * POST /api/feedback — the path from a member's button press to a GitHub issue.
 *
 * Three things carry the feature and are worth pinning:
 *   1. the ATTRIBUTION. "So I can see which member did it" is the entire point;
 *      an issue that loses the name and email is a report nobody can chase.
 *   2. the DEGRADATION. Screenshot storage is the part most likely to be broken
 *      on a given deployment — the bucket is created by SQL someone runs by
 *      hand — and a missing bucket must cost the picture, never the report.
 *   3. the GATE. The route files into a PUBLIC tracker under someone's name, so
 *      it authenticates itself rather than trusting where the button was drawn.
 */

import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSession: {
  user: { email: string; name?: string | null; role?: string; memberId?: string };
} | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

const store = {
  recentFeedbackCount: jest.fn(async () => ({ count: 0, limit: 5 })),
  // The argument is typed even though the stub ignores it: without it the mock
  // infers a zero-length tuple and `mock.calls[0][0]` stops typechecking.
  createFeedbackRecord: jest.fn(
    async (
      _input: Record<string, unknown>
    ): Promise<{ ok: true; id: string } | { ok: false; demo?: true; error?: string }> => ({
      ok: true,
      id: "fb-1",
    })
  ),
  saveScreenshot: jest.fn(
    async (): Promise<{ ok: true; path: string } | { ok: false; error: string }> => ({
      ok: true,
      path: "fb-1.png",
    })
  ),
  attachIssue: jest.fn(async () => {}),
};
jest.mock("@/features/06-portal-feedback/lib/store", () => store);

type IssueArg = { kind: string; description: string; body: string };
const createIssue = jest.fn(
  async (
    _input: IssueArg
  ): Promise<
    { ok: true; number: number; url: string } | { ok: false; error: string }
  > => ({ ok: true, number: 42, url: "https://github.com/o/r/issues/42" })
);
let configured = true;
jest.mock("@/features/06-portal-feedback/lib/github", () => {
  const actual = jest.requireActual("@/features/06-portal-feedback/lib/github");
  return {
    // issueBody / screenshotUrl / titleFor stay REAL — the body is the thing
    // under test, so stubbing it would make these assertions vacuous.
    ...actual,
    createIssue: (input: IssueArg) => createIssue(input),
    githubConfigured: () => configured,
  };
});

import { POST } from "@/features/06-portal-feedback/app/api/feedback/route";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function post(body: unknown): NextRequest {
  return new NextRequest("https://portal.test/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  kind: "bug",
  description: "The week selector resets when I switch projects.",
  page_path: "/portal/accountability",
  screenshot: null,
  viewport: "1512×982",
};

/** The body the route handed to GitHub on the last successful call. */
function lastBody(): string {
  return createIssue.mock.calls.at(-1)?.[0].body ?? "";
}

beforeEach(() => {
  jest.clearAllMocks();
  configured = true;
  mockSession = {
    user: {
      email: "Priya@illinois.edu",
      name: "Priya Raman",
      role: "senior_consultant",
      memberId: "m-1",
    },
  };
  store.recentFeedbackCount.mockResolvedValue({ count: 0, limit: 5 });
  store.createFeedbackRecord.mockResolvedValue({ ok: true, id: "fb-1" });
  store.saveScreenshot.mockResolvedValue({ ok: true, path: "fb-1.png" });
  createIssue.mockResolvedValue({ ok: true, number: 42, url: "https://github.com/o/r/issues/42" });
  process.env.PORTAL_BASE_URL = "https://cubeconsulting.org";
});

// ── The gate ─────────────────────────────────────────────────────────────────

describe("who may file", () => {
  it("refuses a signed-out caller", async () => {
    mockSession = null;
    const res = await POST(post(valid));
    expect(res.status).toBe(401);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("accepts any member role — reporting a bug is not a privilege", async () => {
    for (const role of ["member", "senior_consultant", "project_manager", "exec"]) {
      mockSession = { user: { email: "a@illinois.edu", name: "A", role, memberId: "m" } };
      const res = await POST(post(valid));
      expect(res.status).toBe(200);
    }
  });

  it("refuses once the hourly ceiling is hit, before touching GitHub", async () => {
    store.recentFeedbackCount.mockResolvedValue({ count: 5, limit: 5 });
    const res = await POST(post(valid));
    expect(res.status).toBe(429);
    expect(createIssue).not.toHaveBeenCalled();
    expect(store.createFeedbackRecord).not.toHaveBeenCalled();
  });
});

// ── Attribution ──────────────────────────────────────────────────────────────

describe("the issue names the member who filed it", () => {
  it("carries their name, email and role into the body", async () => {
    await POST(post(valid));
    const body = lastBody();
    expect(body).toContain("Priya Raman");
    expect(body).toContain("priya@illinois.edu");
    expect(body).toContain("senior_consultant");
  });

  it("normalises the address so one member is one reporter", async () => {
    await POST(post(valid));
    // The session's mixed-case address must not become a second identity.
    expect(lastBody()).not.toContain("Priya@illinois.edu");
    expect(store.createFeedbackRecord.mock.calls[0][0]).toMatchObject({
      member_email: "priya@illinois.edu",
    });
  });

  it("falls back to the email alone when the account has no name", async () => {
    mockSession = { user: { email: "x@illinois.edu", name: null, role: "member", memberId: "m" } };
    await POST(post(valid));
    expect(lastBody()).toContain("x@illinois.edu");
  });

  it("records the page they were on — the field nobody would think to type", async () => {
    await POST(post(valid));
    expect(lastBody()).toContain("/portal/accountability");
  });

  it("escapes a pipe in a name instead of shearing the metadata table", async () => {
    mockSession = {
      user: { email: "b@illinois.edu", name: "Ana | Ops", role: "member", memberId: "m" },
    };
    await POST(post(valid));
    expect(lastBody()).toContain("Ana \\| Ops");
  });
});

// ── Anonymity ────────────────────────────────────────────────────────────────
/**
 * The opt-out from all of the above.
 *
 * The issue is filed into a PUBLIC repo, so "anonymous" has to be true of the
 * body itself, not of how a reader is expected to behave. These pin what must
 * be absent from it — and, just as importantly, what must NOT be: the session
 * is still required, the row still names the member, and the hourly ceiling
 * still counts, because the alternative is an unauthenticated path that opens
 * public issues.
 */
describe("filing anonymously", () => {
  it("keeps the name, email and role out of the public issue", async () => {
    await POST(post({ ...valid, anonymous: true }));
    const body = lastBody();
    expect(body).not.toContain("Priya Raman");
    expect(body).not.toContain("priya@illinois.edu");
    expect(body).not.toContain("senior_consultant");
    expect(body).toContain("Anonymous");
  });

  it("still reports the page and the description — anonymity costs the name, not the report", async () => {
    await POST(post({ ...valid, anonymous: true }));
    expect(lastBody()).toContain("/portal/accountability");
    expect(lastBody()).toContain("The week selector resets when I switch projects.");
  });

  it("still records who filed it, so an abusive report can be traced", async () => {
    await POST(post({ ...valid, anonymous: true }));
    expect(store.createFeedbackRecord.mock.calls[0][0]).toMatchObject({
      member_email: "priya@illinois.edu",
      anonymous: true,
    });
  });

  it("still requires a session", async () => {
    mockSession = null;
    const res = await POST(post({ ...valid, anonymous: true }));
    expect(res.status).toBe(401);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("still counts against the hourly ceiling", async () => {
    store.recentFeedbackCount.mockResolvedValue({ count: 5, limit: 5 });
    const res = await POST(post({ ...valid, anonymous: true }));
    expect(res.status).toBe(429);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("tells the widget what it actually did, so the confirmation can't over-promise", async () => {
    const anon = await POST(post({ ...valid, anonymous: true }));
    expect((await anon.json()).anonymous).toBe(true);
    const signed = await POST(post(valid));
    expect((await signed.json()).anonymous).toBe(false);
  });

  it("signs the issue for anything that isn't exactly `true`", async () => {
    // The failure direction that matters: a garbled field must publish a name
    // the member expected to be published, never silently withhold one they
    // never asked to withhold.
    for (const value of [undefined, false, null, "true", 1, {}]) {
      jest.clearAllMocks();
      createIssue.mockResolvedValue({ ok: true, number: 42, url: "https://github.com/o/r/issues/42" });
      await POST(post({ ...valid, anonymous: value }));
      expect(lastBody()).toContain("priya@illinois.edu");
    }
  });

  it("does not tell readers to chase a reporter who isn't named", async () => {
    store.saveScreenshot.mockResolvedValue({ ok: false, error: "no bucket" });
    await POST(post({ ...valid, anonymous: true, screenshot: PNG }));
    expect(lastBody()).not.toContain("Ask the reporter");
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("what it refuses", () => {
  it("rejects an unknown kind", async () => {
    const res = await POST(post({ ...valid, kind: "complaint" }));
    expect(res.status).toBe(400);
  });

  it("rejects an empty or whitespace-only description", async () => {
    expect((await POST(post({ ...valid, description: "" }))).status).toBe(400);
    expect((await POST(post({ ...valid, description: "   \n " }))).status).toBe(400);
  });

  it("rejects a description past the cap", async () => {
    const res = await POST(post({ ...valid, description: "x".repeat(4001) }));
    expect(res.status).toBe(400);
  });

  it("rejects a screenshot that isn't an allowed image", async () => {
    const res = await POST(post({ ...valid, screenshot: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" }));
    expect(res.status).toBe(400);
    expect(createIssue).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const req = new NextRequest("https://portal.test/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("drops a page_path that isn't a plain in-site path rather than echoing it publicly", async () => {
    await POST(post({ ...valid, page_path: "https://evil.example/steal?x=1" }));
    expect(lastBody()).not.toContain("evil.example");
    expect(lastBody()).toContain("/portal");
  });

  it("drops a viewport that isn't two numbers", async () => {
    await POST(post({ ...valid, viewport: "<script>alert(1)</script>" }));
    expect(lastBody()).not.toContain("script");
  });

  it("answers 503 rather than pretending, when no GitHub token is set", async () => {
    configured = false;
    const res = await POST(post(valid));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
    // Nothing recorded either — a row the member thinks reached GitHub is worse
    // than a clear refusal.
    expect(store.createFeedbackRecord).not.toHaveBeenCalled();
  });
});

// ── Screenshots ──────────────────────────────────────────────────────────────

describe("the screenshot", () => {
  it("is stored against the new row and linked, not embedded", async () => {
    await POST(post({ ...valid, screenshot: PNG }));
    expect(store.saveScreenshot).toHaveBeenCalledWith("fb-1", expect.anything(), "image/png");

    const body = lastBody();
    const url = "https://cubeconsulting.org/api/feedback/screenshot/fb-1.png";
    expect(body).toContain(url);
    // An `![](…)` embed would render as a broken image on GitHub every time:
    // its proxy fetches anonymously and this route requires a session.
    expect(body).not.toContain(`![`);
    expect(body).toMatch(/requires a CUBE portal sign-in/i);
  });

  it("still files the issue when the bucket doesn't exist yet, and says so", async () => {
    store.saveScreenshot.mockResolvedValue({ ok: false, error: "Bucket not found" });
    const res = await POST(post({ ...valid, screenshot: PNG }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true, screenshotSaved: false });
    expect(lastBody()).toMatch(/couldn't be stored/i);
  });

  it("still files the issue when Supabase isn't configured at all", async () => {
    store.createFeedbackRecord.mockResolvedValue({ ok: false, demo: true });
    const res = await POST(post({ ...valid, screenshot: PNG }));

    expect(res.status).toBe(200);
    expect(store.saveScreenshot).not.toHaveBeenCalled();
    expect(lastBody()).toMatch(/wasn't saved/i);
  });

  it("adds no screenshot section when the member didn't attach one", async () => {
    await POST(post(valid));
    expect(lastBody()).not.toContain("### Screenshot");
    expect(store.saveScreenshot).not.toHaveBeenCalled();
  });
});

// ── Reporting back ───────────────────────────────────────────────────────────

describe("what the member is told", () => {
  it("returns the issue number and URL on success", async () => {
    const res = await POST(post(valid));
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      issue: { number: 42, url: "https://github.com/o/r/issues/42" },
    });
    expect(store.attachIssue).toHaveBeenCalledWith("fb-1", 42, "https://github.com/o/r/issues/42");
  });

  it("surfaces GitHub's own reason when the call fails", async () => {
    createIssue.mockResolvedValue({ ok: false, error: "GitHub rejected the token (401)." });
    const res = await POST(post(valid));
    expect(res.status).toBe(502);
    // `recorded` is what stops "couldn't file" reading as "your report is gone".
    await expect(res.json()).resolves.toMatchObject({ ok: false, recorded: true });
  });
});
