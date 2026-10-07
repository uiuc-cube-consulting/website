import { NextRequest } from "next/server";

let mockSession: { user?: { email?: string | null } } | null = null;
const mockFetchUpcomingEvents = jest.fn();

jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));
jest.mock("@/lib/calendar", () => ({ fetchUpcomingEvents: (...args: unknown[]) => mockFetchUpcomingEvents(...args) }));

import { GET } from "@/app/api/calendar/route";

describe("GET /api/calendar", () => {
  beforeEach(() => {
    mockSession = null;
    mockFetchUpcomingEvents.mockReset();
  });

  it("returns 401 without a signed-in session", async () => {
    const response = await GET(new NextRequest("https://portal.test/api/calendar"));

    expect(response.status).toBe(401);
    expect(mockFetchUpcomingEvents).not.toHaveBeenCalled();
  });
});
