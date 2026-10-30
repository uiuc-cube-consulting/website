let mockSession: { user: { memberId?: string; role?: string } } | null;
jest.mock("@/auth", () => ({ auth: jest.fn(async () => mockSession) }));
jest.mock("@/features/08-member-matching/lib/store", () => {
  const original = jest.requireActual("@/features/08-member-matching/lib/store");
  return { ...original, currentMember: jest.fn() };
});
jest.mock("@/features/09-cube-network/lib/store", () => ({ saveReview: jest.fn() }));
import { currentMember, StoreError } from "@/features/08-member-matching/lib/store";
import { saveReview } from "@/features/09-cube-network/lib/store";
import { PUT } from "@/app/api/directory/review/route";
const ID = "10000000-0000-4000-8000-000000000001";
const valid = { target_kind: "member", target_id: ID, identity_status: "evidence_found", uiuc_status: "unknown", source_url: "https://www.linkedin.com/in/example/", notes: "" };
function request(body: unknown, origin = "https://cube.test") {
  return new Request("https://cube.test/api/directory/review", { method: "PUT", headers: { "content-type": "application/json", origin }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockSession = { user: { memberId: ID, role: "exec" } };
  (currentMember as jest.Mock).mockResolvedValue({ id: ID, role: "exec" });
  (saveReview as jest.Mock).mockResolvedValue({ checked_at: "2026-10-30T00:00:00Z" });
});
it("requires sign-in", async () => {
  mockSession = null;
  expect((await PUT(request(valid))).status).toBe(401);
  expect(saveReview).not.toHaveBeenCalled();
});
it("does not trust a stale exec role or a removed roster member", async () => {
  (currentMember as jest.Mock).mockResolvedValue({ id: ID, role: "member" });
  expect((await PUT(request(valid))).status).toBe(403);
  (currentMember as jest.Mock).mockResolvedValue(null);
  expect((await PUT(request(valid))).status).toBe(401);
  expect(saveReview).not.toHaveBeenCalled();
});
it("saves reviewed statuses with server-derived identity and timestamp", async () => {
  const response = await PUT(request({ ...valid, checked_by: "spoofed", checked_at: "spoofed" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, checked_at: "2026-10-30T00:00:00Z" });
  expect(saveReview).toHaveBeenCalledWith(ID, valid);
});
it("rejects cross-origin, invalid JSON, unsafe sources and oversized bodies", async () => {
  expect((await PUT(request(valid, "https://evil.test"))).status).toBe(403);
  expect((await PUT(request("{"))).status).toBe(400);
  expect((await PUT(request({ ...valid, source_url: "javascript:alert(1)" }))).status).toBe(400);
  expect((await PUT(request({ ...valid, notes: "x".repeat(5000) }))).status).toBe(400);
  expect(saveReview).not.toHaveBeenCalled();
});
it("does not leak infrastructure errors or return false success", async () => {
  (saveReview as jest.Mock).mockRejectedValue(new Error("private SQL response"));
  const response = await PUT(request(valid));
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain("private");
  (saveReview as jest.Mock).mockRejectedValue(new StoreError("Not found", 404));
  expect((await PUT(request(valid))).status).toBe(404);
});
