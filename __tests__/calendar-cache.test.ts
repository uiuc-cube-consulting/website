const mockEventsList = jest.fn();

jest.mock("googleapis", () => ({
  google: {
    auth: { JWT: jest.fn() },
    calendar: jest.fn(() => ({ events: { list: mockEventsList } })),
  },
}));

import { fetchUpcomingEvents } from "@/lib/calendar";

describe("fetchUpcomingEvents cache", () => {
  const realNow = Date.now;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: "calendar@example.invalid", private_key: "test" });
    mockEventsList.mockReset().mockResolvedValue({ data: { items: [] } });
  });

  afterEach(() => {
    jest.useRealTimers();
    Date.now = realNow;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  });

  it("reuses a successful Google response for five minutes, then fetches again", async () => {
    const opts = {
      calendarId: "cache-test@example.invalid",
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-11-01T00:00:00Z"),
    };

    await fetchUpcomingEvents(opts);
    await fetchUpcomingEvents(opts);
    expect(mockEventsList).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5 * 60 * 1000);
    await fetchUpcomingEvents(opts);
    expect(mockEventsList).toHaveBeenCalledTimes(2);
  });

  it("does not cache errors", async () => {
    mockEventsList.mockRejectedValueOnce(new Error("Calendar not found"));
    const opts = {
      calendarId: "error-test@example.invalid",
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-11-01T00:00:00Z"),
    };

    await expect(fetchUpcomingEvents(opts)).resolves.toMatchObject({ ok: false });
    await expect(fetchUpcomingEvents(opts)).resolves.toMatchObject({ ok: true });
    expect(mockEventsList).toHaveBeenCalledTimes(2);
  });
});
