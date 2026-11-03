/**
 * Member search: LIKE wildcards must be escaped, short/long queries short-circuit,
 * and unauthenticated callers get 401.
 */

import { NextRequest } from "next/server";

let mockSession: Record<string, unknown> | null = null;
jest.mock("@/auth", () => ({
  auth: jest.fn(() => Promise.resolve(mockSession)),
}));

const mockIlike = jest.fn();
const mockLimit = jest.fn();
const mockSelect = jest.fn();
const mockFrom = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createServerClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

function makeRequest(q?: string): NextRequest {
  const url = new URL("http://localhost/api/members/search");
  if (q !== undefined) url.searchParams.set("q", q);
  return new NextRequest(url);
}

function authedSession() {
  return {
    user: {
      memberId: "m1",
      role: "member",
      name: "Search User",
      email: "searcher@cubeconsulting.org",
    },
  };
}

beforeEach(() => {
  mockSession = authedSession();
  mockIlike.mockReset();
  mockLimit.mockReset();
  mockSelect.mockReset();
  mockFrom.mockReset();

  mockLimit.mockResolvedValue({
    data: [{ id: "m-hit", full_name: "Ann_Lee", email: "ann@example.com" }],
    error: null,
  });
  mockIlike.mockReturnValue({ limit: mockLimit });
  mockSelect.mockReturnValue({ ilike: mockIlike });
  mockFrom.mockReturnValue({ select: mockSelect });
});

describe("GET /api/members/search", () => {
  it("returns 401 when unauthenticated", async () => {
    mockSession = null;
    const { GET } = await import("@/app/api/members/search/route");
    const res = await GET(makeRequest("Ann"));
    expect(res.status).toBe(401);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns an empty list for a one-character query without hitting Supabase", async () => {
    const { GET } = await import("@/app/api/members/search/route");
    const res = await GET(makeRequest("A"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ members: [] });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns an empty list for a query longer than 80 characters", async () => {
    const { GET } = await import("@/app/api/members/search/route");
    const res = await GET(makeRequest("x".repeat(81)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ members: [] });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("escapes LIKE wildcards before building the ilike pattern", async () => {
    const { GET } = await import("@/app/api/members/search/route");
    const res = await GET(makeRequest("Ann_Lee%"));
    expect(res.status).toBe(200);
    expect(mockIlike).toHaveBeenCalledWith("full_name", `%Ann\\_Lee\\%%`);
    expect(await res.json()).toEqual({
      members: [{ id: "m-hit", name: "Ann_Lee", email: "ann@example.com" }],
    });
  });

  it("escapes a lone % so it is not a match-everything wildcard", async () => {
    const { GET } = await import("@/app/api/members/search/route");
    // Two characters so the min-length gate does not short-circuit first.
    await GET(makeRequest("%%"));
    expect(mockIlike).toHaveBeenCalledWith("full_name", `%\\%\\%%`);
  });
});
