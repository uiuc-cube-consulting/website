let mockSession: { user: { memberId?: string; role?: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(async () => mockSession) }));
jest.mock("@/features/08-member-matching/lib/store", () => {
  const actual = jest.requireActual("@/features/08-member-matching/lib/store");
  return { ...actual, currentMember: jest.fn(), loadMatching: jest.fn(), saveProfile: jest.fn(), savePreference: jest.fn(), manageMatching: jest.fn() };
});
import { GET, PUT, POST, PATCH } from "@/app/api/project-matching/route";
import { EMPTY_PROFILE } from "@/features/08-member-matching/lib/model";
import * as store from "@/features/08-member-matching/lib/store";
const currentMember = store.currentMember as jest.Mock;
const loadMatching = store.loadMatching as jest.Mock;
const saveProfile = store.saveProfile as jest.Mock;
const savePreference = store.savePreference as jest.Mock;
const manageMatching = store.manageMatching as jest.Mock;
const ID = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";
function req(method: string, body: unknown, extra: Record<string, string> = {}) {
  return new Request("https://cube.test/api/project-matching", { method, headers: { "content-type": "application/json", origin: "https://cube.test", ...extra }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: { memberId: ID, role: "member" } };
  currentMember.mockResolvedValue({ id: ID, role: "member" });
  loadMatching.mockResolvedValue({ profile: EMPTY_PROFILE });
  saveProfile.mockResolvedValue(undefined); savePreference.mockResolvedValue(undefined); manageMatching.mockResolvedValue(undefined);
});
it.each([GET, PUT, POST, PATCH])("rejects signed-out users before touching storage", async (handler) => {
  mockSession = null;
  const result = await handler(req("POST", {}));
  expect(result.status).toBe(401);
  expect(currentMember).not.toHaveBeenCalled();
  expect(saveProfile).not.toHaveBeenCalled();
});
it("rechecks membership and fails closed for a removed member", async () => {
  currentMember.mockResolvedValue(null);
  expect((await GET()).status).toBe(401);
  expect(loadMatching).not.toHaveBeenCalled();
});
it("uses the live roster role, not an old exec JWT", async () => {
  mockSession!.user.role = "exec";
  expect((await PATCH(req("PATCH", { action: "close", cycle_id: ID }))).status).toBe(403);
  expect(manageMatching).not.toHaveBeenCalled();
});
it("never trusts a requested member id or role", async () => {
  expect((await PUT(req("PUT", { ...EMPTY_PROFILE, member_id: OTHER, role: "exec" }))).status).toBe(200);
  expect(saveProfile).toHaveBeenCalledWith(ID, EMPTY_PROFILE);
});
it("submits a complete ranked array for an atomic database save", async () => {
  const body = { cycle_id: ID, ranked_project_ids: [ID, OTHER], notes: "", hours_per_week: 4, member_id: OTHER };
  expect((await POST(req("POST", body))).status).toBe(200);
  expect(savePreference).toHaveBeenCalledWith(ID, { cycle_id: ID, ranked_project_ids: [ID, OTHER], notes: "", hours_per_week: 4 });
});
it("does not write malformed, oversized or invalid inputs", async () => {
  expect((await POST(req("POST", "{"))).status).toBe(400);
  expect((await POST(req("POST", JSON.stringify({ notes: "x".repeat(17000) })))).status).toBe(400);
  expect((await POST(req("POST", { cycle_id: ID, ranked_project_ids: [ID, ID], hours_per_week: 5, notes: "" }))).status).toBe(400);
  expect(savePreference).not.toHaveBeenCalled();
});
it("rejects cross-origin writes and non-JSON requests", async () => {
  expect((await PUT(req("PUT", EMPTY_PROFILE, { origin: "https://evil.test" }))).status).toBe(403);
  expect((await PUT(req("PUT", EMPTY_PROFILE, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
  expect((await PUT(req("PUT", EMPTY_PROFILE, { "content-type": "text/plain" }))).status).toBe(403);
  expect(saveProfile).not.toHaveBeenCalled();
});
it("only permits exec administration and allowlists its payload", async () => {
  currentMember.mockResolvedValue({ id: ID, role: "exec" });
  expect((await PATCH(req("PATCH", { action: "close", cycle_id: OTHER, actor: OTHER }))).status).toBe(200);
  expect(manageMatching).toHaveBeenCalledWith(ID, { action: "close", cycle_id: OTHER });
});
it("uses private no-store responses", async () => {
  expect((await GET()).headers.get("Cache-Control")).toBe("private, no-store");
});
it("never returns raw infrastructure errors or false save success", async () => {
  saveProfile.mockRejectedValue(new Error("secret database details"));
  const response = await PUT(req("PUT", EMPTY_PROFILE));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("secret");
});
it("reports missing migration and closed-cycle conflicts without leaking SQL", async () => {
  savePreference.mockRejectedValue(new store.StoreError("This semester cannot accept that change.", 409));
  const res = await POST(req("POST", { cycle_id: ID, ranked_project_ids: [ID], notes: "", hours_per_week: 5 }));
  expect(res.status).toBe(409);
});
