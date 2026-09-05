/**
 * POST /api/feedback/anonymous — the note a member sends to exec with nothing
 * on it that says who they are.
 *
 * The whole feature is a promise, and these are the terms of it:
 *   1. WHAT LEAVES. The email must reach both exec addresses carrying the
 *      message and nothing about the person — not the name the session knows,
 *      not the address, not the role. This is the assertion that matters; every
 *      other line here supports it.
 *   2. WHAT STAYS. Nothing is written down. There is no store to mock because
 *      the route has nothing to store the note in.
 *   3. WHAT'S STILL REQUIRED. Anonymous is not unauthenticated: the session
 *      gate and the hourly ceiling both survive, because a form that emails two
 *      people without either is a spam cannon.
 */

import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSession: { user: { email: string; name?: string | null; role?: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

type Sent = { to: string | string[]; subject: string; html: string };
const sendEmail = jest.fn(async (_opts: Sent) => ({ messageId: "m1" }));
jest.mock("@/lib/email/send", () => ({ sendEmail: (o: Sent) => sendEmail(o) }));

const quota = {
  checkQuota: jest.fn(async () => ({ allowed: true, sent: 0, limit: 5 })),
  recordSend: jest.fn(async () => {}),
};
jest.mock("@/features/06-portal-feedback/lib/anonymous-store", () => quota);

import { POST } from "@/features/06-portal-feedback/app/api/feedback/anonymous/route";
import { anonymousNoteEmail, anonymousRecipients } from "@/features/06-portal-feedback/lib/anonymous-email";

function post(body: unknown): NextRequest {
  return new NextRequest("https://portal.test/api/feedback/anonymous", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  topic: "conduct",
  message: "A PM has been making comments in standup that people are uncomfortable with.",
};

/** What the route handed the mailer on the last call. */
function lastSent(): Sent {
  return sendEmail.mock.calls.at(-1)![0];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: { email: "Priya@illinois.edu", name: "Priya Raman", role: "senior_consultant" } };
  quota.checkQuota.mockResolvedValue({ allowed: true, sent: 0, limit: 5 });
  sendEmail.mockResolvedValue({ messageId: "m1" });
  delete process.env.ANONYMOUS_REPORT_RECIPIENTS;
});

// ── Where it goes ────────────────────────────────────────────────────────────

describe("delivery", () => {
  it("emails both exec addresses", async () => {
    const res = await POST(post(valid));
    expect(res.status).toBe(200);
    expect(lastSent().to).toEqual(["director@cubeconsulting.org", "hr@cubeconsulting.org"]);
  });

  it("carries the member's words and the topic", async () => {
    await POST(post(valid));
    expect(lastSent().html).toContain("uncomfortable with");
    expect(lastSent().subject).toContain("Anonymous");
    expect(lastSent().subject).toContain("Something happened that exec should know about");
  });

  it("can be pointed somewhere else without a deploy", async () => {
    process.env.ANONYMOUS_REPORT_RECIPIENTS = "president@cubeconsulting.org, hr@cubeconsulting.org";
    await POST(post(valid));
    expect(lastSent().to).toEqual(["president@cubeconsulting.org", "hr@cubeconsulting.org"]);
  });

  it("falls back to the real addresses rather than delivering to nobody", async () => {
    process.env.ANONYMOUS_REPORT_RECIPIENTS = "   ,  not-an-address ";
    expect(anonymousRecipients()).toEqual([
      "director@cubeconsulting.org",
      "hr@cubeconsulting.org",
    ]);
  });

  it("tells the member it failed, and does not spend a quota slot, when the mail bounces", async () => {
    sendEmail.mockRejectedValue(new Error("SMTP down"));
    const res = await POST(post(valid));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/still in the box/i);
    expect(quota.recordSend).not.toHaveBeenCalled();
  });
});

// ── The promise ──────────────────────────────────────────────────────────────

describe("what the email does not say", () => {
  it("names nobody: not the name, the address, or the role on the session", async () => {
    await POST(post(valid));
    const { html, subject } = lastSent();
    for (const leak of ["Priya Raman", "Priya@illinois.edu", "priya@illinois.edu", "senior_consultant"]) {
      expect(html).not.toContain(leak);
      expect(subject).not.toContain(leak);
    }
  });

  it("is not given the identity in the first place", () => {
    // The guarantee is structural, not a filter: `anonymousNoteEmail` has no
    // parameter that could carry a member. If someone ever adds one, this stops
    // compiling — which is the point of asserting it here.
    const built = anonymousNoteEmail({ topic: "culture", message: "Meetings run long." });
    expect(built.html).toContain("Meetings run long.");
    expect(built.html).toContain("no way to reply");
  });

  it("stores nothing — the route has no note store to call", async () => {
    await POST(post(valid));
    // Only the quota counter was touched, and it only ever sees a hash.
    expect(quota.recordSend).toHaveBeenCalledWith("priya@illinois.edu");
    expect(quota.recordSend).toHaveBeenCalledTimes(1);
  });
});

// ── The contact line ─────────────────────────────────────────────────────────

describe("the optional way back", () => {
  it("passes through exactly what the member typed", async () => {
    await POST(post({ ...valid, contact: "catch me after the next GBM" }));
    expect(lastSent().html).toContain("catch me after the next GBM");
  });

  it("never substitutes their session address for a blank box", async () => {
    for (const contact of [undefined, "", "   "]) {
      jest.clearAllMocks();
      await POST(post({ ...valid, contact }));
      expect(lastSent().html).not.toContain("priya@illinois.edu");
      expect(lastSent().html).toContain("no way to reply");
    }
  });

  it("escapes what it echoes, rather than letting it be markup", async () => {
    await POST(post({ ...valid, contact: '<script>alert(1)</script>' }));
    expect(lastSent().html).not.toContain("<script>");
    expect(lastSent().html).toContain("&lt;script&gt;");
  });

  it("keeps the member's paragraphs without keeping their angle brackets", async () => {
    await POST(post({ ...valid, message: "First thing.\n\nSecond <b>thing</b>." }));
    const html = lastSent().html;
    expect(html).toContain("<p>First thing.</p>");
    expect(html).toContain("&lt;b&gt;");
  });
});

// ── Still a gate ─────────────────────────────────────────────────────────────

describe("anonymous is not unauthenticated", () => {
  it("refuses a signed-out caller", async () => {
    mockSession = null;
    const res = await POST(post(valid));
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses once the hourly ceiling is hit, before anything is sent", async () => {
    quota.checkQuota.mockResolvedValue({ allowed: false, sent: 5, limit: 5 });
    const res = await POST(post(valid));
    expect(res.status).toBe(429);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("counts the ceiling against the member, who the mail never names", async () => {
    await POST(post(valid));
    expect(quota.checkQuota).toHaveBeenCalledWith("priya@illinois.edu");
  });

  it("is open to every role — the member who needs this has the least standing", async () => {
    for (const role of ["member", "senior_consultant", "project_manager", "exec"]) {
      mockSession = { user: { email: "a@illinois.edu", role } };
      expect((await POST(post(valid))).status).toBe(200);
    }
  });
});

// ── Validation ───────────────────────────────────────────────────────────────

describe("what it refuses", () => {
  it("rejects an unknown topic", async () => {
    expect((await POST(post({ ...valid, topic: "gossip" }))).status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty or whitespace-only message", async () => {
    expect((await POST(post({ ...valid, message: "" }))).status).toBe(400);
    expect((await POST(post({ ...valid, message: "  \n " }))).status).toBe(400);
  });

  it("rejects a message past the cap", async () => {
    expect((await POST(post({ ...valid, message: "x".repeat(8001) }))).status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const req = new NextRequest("https://portal.test/api/feedback/anonymous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("truncates an over-long contact line instead of refusing the note", async () => {
    await POST(post({ ...valid, contact: "z".repeat(500) }));
    expect(sendEmail).toHaveBeenCalled();
    expect(lastSent().html).toContain("z".repeat(200));
    expect(lastSent().html).not.toContain("z".repeat(201));
  });
});
