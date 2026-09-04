/**
 * GET /api/feedback/screenshot/[id] — who gets to see the picture.
 *
 * This route is the reason the Storage bucket is private. The issue linking
 * here is PUBLIC, and a screenshot of the portal is a picture of whatever the
 * reporter had on screen: a strike, an accountability grid, an applicant's
 * file. So the link is worthless without a session, and a session alone is not
 * enough — a consultant must not read an exec's screen by way of a bug report.
 */

import { NextRequest } from "next/server";
import type { FeedbackRow } from "@/features/06-portal-feedback/lib/store";

let mockSession: { user: { email: string; role?: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

const store = {
  getFeedback: jest.fn(async (): Promise<FeedbackRow | null> => row()),
  downloadScreenshot: jest.fn(async (): Promise<Uint8Array | null> => new Uint8Array([1, 2, 3])),
};
jest.mock("@/features/06-portal-feedback/lib/store", () => store);

import { GET } from "@/features/06-portal-feedback/app/api/feedback/screenshot/[id]/route";

function row(over: Partial<FeedbackRow> = {}): FeedbackRow {
  return {
    id: "fb-1",
    created_at: "2026-09-03T00:00:00.000Z",
    member_email: "priya@illinois.edu",
    member_name: "Priya Raman",
    member_role: "senior_consultant",
    kind: "bug",
    description: "…",
    page_path: "/portal/accountability",
    screenshot_path: "fb-1.png",
    screenshot_mime: "image/png",
    issue_number: 42,
    issue_url: "https://github.com/o/r/issues/42",
    ...over,
  };
}

function get(id = "fb-1.png") {
  return GET(new NextRequest(`https://portal.test/api/feedback/screenshot/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  store.getFeedback.mockResolvedValue(row());
  store.downloadScreenshot.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mockSession = { user: { email: "priya@illinois.edu", role: "senior_consultant" } };
});

describe("access", () => {
  it("sends a signed-out visitor to sign-in with a way back, not a JSON 401", async () => {
    // The link is clicked from a GitHub issue, usually on a machine that isn't
    // signed in — an error in a browser tab would be a dead end.
    mockSession = null;
    const res = await get();
    expect(res.status).toBe(307);

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/portal/sign-in");
    expect(location.searchParams.get("callbackUrl")).toBe("/api/feedback/screenshot/fb-1.png");
  });

  it("serves the reporter their own screenshot", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
  });

  it("serves exec, who triage these", async () => {
    mockSession = { user: { email: "mann@illinois.edu", role: "exec" } };
    expect((await get()).status).toBe(200);
  });

  it("refuses another member — the shot may show a page they can't open", async () => {
    mockSession = { user: { email: "someone@illinois.edu", role: "project_manager" } };
    const res = await get();
    expect(res.status).toBe(403);
    expect(store.downloadScreenshot).not.toHaveBeenCalled();
  });

  it("compares addresses case-insensitively", async () => {
    mockSession = { user: { email: "Priya@Illinois.edu", role: "member" } };
    expect((await get()).status).toBe(200);
  });
});

describe("serving", () => {
  it("strips the cosmetic extension before looking the row up", async () => {
    await get("fb-1.png");
    expect(store.getFeedback).toHaveBeenCalledWith("fb-1");
  });

  it("404s for an unknown report and for one with no screenshot", async () => {
    store.getFeedback.mockResolvedValue(null);
    expect((await get()).status).toBe(404);

    store.getFeedback.mockResolvedValue(row({ screenshot_path: null }));
    expect((await get()).status).toBe(404);
  });

  it("never serves a mime outside the allowlist, even from a hand-edited row", async () => {
    // Defence in depth: nothing but PNG/JPEG/WebP can be written through the
    // API, but this header is what a browser acts on, and `text/html` served
    // from the portal's own origin would be script.
    store.getFeedback.mockResolvedValue(row({ screenshot_mime: "text/html" }));
    const res = await get();
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("keeps the bytes out of every cache", async () => {
    const res = await get();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
