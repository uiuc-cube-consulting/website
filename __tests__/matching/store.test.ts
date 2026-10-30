jest.mock("@/lib/supabase/server", () => ({ createServerClient: jest.fn() }));
import { createServerClient } from "@/lib/supabase/server";
import { EMPTY_PROFILE, type Member } from "@/features/08-member-matching/lib/model";
import { loadMatching, saveProfile, savePreference, manageMatching } from "@/features/08-member-matching/lib/store";
const member = { id: "member-one", role: "member" } as Member;
let operations: { table: string; method: string; args: unknown[] }[];
let rpc: jest.Mock;
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-fixture-not-a-credential";
  operations = [];
  rpc = jest.fn().mockResolvedValue({ error: null });
  (createServerClient as jest.Mock).mockImplementation(() => ({
    rpc,
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "in", "order", "maybeSingle", "upsert"]) {
        query[method] = (...args: unknown[]) => { operations.push({ table, method, args }); return query; };
      }
      query.then = (resolve: (v: unknown) => void) => resolve({ data: table === "matching_cycles" ? [{ id: "visible-cycle" }] : table === "member_profiles" ? null : [], error: null });
      return query;
    },
  }));
});
afterEach(() => { delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY; });
it("ordinary members cannot read drafts or others' preferences/profiles", async () => {
  const result = await loadMatching(member);
  expect(operations).toContainEqual({ table: "matching_cycles", method: "neq", args: ["status", "draft"] });
  expect(operations).toContainEqual({ table: "matching_preferences", method: "eq", args: ["member_id", member.id] });
  expect(operations).toContainEqual({ table: "member_profiles", method: "eq", args: ["member_id", member.id] });
  expect(operations.filter((o) => o.table === "members")).toHaveLength(0);
  expect(result).not.toHaveProperty("members");
  expect(result).not.toHaveProperty("profiles");
});
it("exec get roster/profile data for reviewing missing responses", async () => {
  await loadMatching({ ...member, role: "exec" });
  expect(operations.some((o) => o.table === "members")).toBe(true);
  expect(operations.filter((o) => o.table === "matching_cycles" && o.method === "neq")).toHaveLength(0);
});
it("scopes profile writes and does not modify the authorization roster", async () => {
  await saveProfile(member.id, EMPTY_PROFILE);
  expect(operations.find((o) => o.method === "upsert")?.table).toBe("member_profiles");
  expect(operations.find((o) => o.method === "upsert")?.args[0]).toMatchObject({ member_id: member.id });
  expect(operations.some((o) => o.table === "members")).toBe(false);
});
it("saves ranks in one RPC, not delete-and-insert writes", async () => {
  await savePreference(member.id, { cycle_id: "semester", ranked_project_ids: ["one", "two"], hours_per_week: 5, notes: "Goals" });
  expect(rpc).toHaveBeenCalledWith("matching_save_preferences", { actor: member.id, cycle: "semester", ranked: ["one", "two"], hours: 5, note: "Goals" });
});
it("sends server-derived actor to the exec-checked RPC", async () => {
  await manageMatching(member.id, { action: "close", cycle_id: "semester" });
  expect(rpc).toHaveBeenCalledWith("matching_manage", { actor: member.id, payload: { action: "close", cycle_id: "semester" } });
});
