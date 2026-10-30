import { EMPTY_PROFILE, InputError, INTERESTS, accepting, parseAdminAction, parsePreference, parseProfile, profileCompletion, sharedInterests, type Cycle, type Project } from "@/features/08-member-matching/lib/model";

const ID = "10000000-0000-4000-8000-000000000001";
describe("persistent member profiles", () => {
  it("allows incomplete profiles, with optional links", () => {
    expect(parseProfile(EMPTY_PROFILE)).toEqual(EMPTY_PROFILE);
    expect(profileCompletion(EMPTY_PROFILE)).toBe(0);
  });
  it("allowlists editable fields, never roster identity or role", () => {
    const result = parseProfile({ ...EMPTY_PROFILE, member_id: ID, role: "exec", full_name: "Overwritten" });
    expect(result).not.toHaveProperty("member_id");
    expect(result).not.toHaveProperty("role");
    expect(result).not.toHaveProperty("full_name");
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com", "not a url"])("rejects unsafe website %s", (website) => {
    expect(() => parseProfile({ ...EMPTY_PROFILE, website })).toThrow(InputError);
  });
  it("validates links, length, integer year and skill limits", () => {
    expect(parseProfile({ ...EMPTY_PROFILE, website: "https://example.com" }).website).toBe("https://example.com/");
    expect(() => parseProfile({ ...EMPTY_PROFILE, bio: "x".repeat(801) })).toThrow();
    expect(() => parseProfile({ ...EMPTY_PROFILE, graduation_year: 2028.5 })).toThrow();
    expect(() => parseProfile({ ...EMPTY_PROFILE, skills: Array(16).fill("Python") })).toThrow();
    expect(() => parseProfile({ ...EMPTY_PROFILE, skills: ["Python", "python"] })).toThrow();
  });
  it("uses explicit interests rather than accepting arbitrary inferred attributes", () => {
    expect(parseProfile({ ...EMPTY_PROFILE, interests: [...INTERESTS] }).interests).toHaveLength(10);
    expect(() => parseProfile({ ...EMPTY_PROFILE, interests: ["Secret inference"] })).toThrow();
  });
  it("computes completeness without requiring social links", () => {
    expect(profileCompletion({ ...EMPTY_PROFILE, bio: "Bio", major: "Statistics", graduation_year: 2028, interests: ["Strategy"], skills: ["Python"], learning_goals: "Client research" })).toBe(100);
  });
});
describe("semester preferences", () => {
  const valid = { cycle_id: ID, ranked_project_ids: [ID], notes: "My goals", hours_per_week: 5 };
  it("preserves ranked order", () => {
    const ids = [ID, ID.replace(/1$/, "2"), ID.replace(/1$/, "3")];
    expect(parsePreference({ ...valid, ranked_project_ids: ids }).ranked_project_ids).toEqual(ids);
  });
  it.each([[], [ID, ID], [ID, ID, ID, ID], ["another-semester"], [null]].map((ranked_project_ids) => ({ ranked_project_ids })))("rejects invalid or duplicate ranks $ranked_project_ids", ({ ranked_project_ids }) => {
    expect(() => parsePreference({ ...valid, ranked_project_ids })).toThrow();
  });
  it.each([0, 41, 5.5, "5", null])("rejects invalid availability %j", (hours_per_week) => {
    expect(() => parsePreference({ ...valid, hours_per_week })).toThrow();
  });
  it("does not accept member identity from the body", () => {
    expect(parsePreference({ ...valid, member_id: ID })).not.toHaveProperty("member_id");
  });
  it("bounds notes and rejects non-object input", () => {
    expect(() => parsePreference({ ...valid, notes: "x".repeat(1001) })).toThrow();
    expect(() => parseProfile(null)).toThrow();
    expect(() => parseProfile([])).toThrow();
  });
  const cycle: Cycle = { id: ID, name: "Test", status: "open", deadline: "2030-01-01T00:00:00Z", created_at: "" };
  it("closes exactly at the deadline and never accepts draft or closed cycles", () => {
    expect(accepting(cycle, Date.parse("2029-01-01"))).toBe(true);
    expect(accepting(cycle, Date.parse(cycle.deadline!))).toBe(false);
    expect(accepting({ ...cycle, status: "draft", deadline: null })).toBe(false);
    expect(accepting({ ...cycle, status: "closed", deadline: null })).toBe(false);
  });
});
describe("semester administration", () => {
  it("accepts draft creation with optional future deadline", () => {
    expect(parseAdminAction({ action: "create_cycle", name: " Spring 2030 ", deadline: null })).toEqual({ action: "create_cycle", name: "Spring 2030", deadline: null });
    expect(() => parseAdminAction({ action: "create_cycle", name: "", deadline: null })).toThrow();
    expect(() => parseAdminAction({ action: "create_cycle", name: "Test", deadline: "2020-01-01" })).toThrow();
  });
  it("validates project briefs and capacities", () => {
    const project = { action: "add_project", cycle_id: ID, title: "Test", client: "", summary: "Brief", tags: ["Technology"], capacity: 6 };
    expect(parseAdminAction(project)).toEqual(project);
    expect(() => parseAdminAction({ ...project, capacity: 0 })).toThrow();
    expect(() => parseAdminAction({ ...project, summary: "" })).toThrow();
    expect(() => parseAdminAction({ action: "delete_everything", cycle_id: ID })).toThrow();
  });
  it("explains suggestions as explicit shared tags, not assignments", () => {
    const project = { tags: ["Technology", "Strategy"] } as Project;
    expect(sharedInterests({ ...EMPTY_PROFILE, interests: ["Technology"] }, project)).toEqual(["Technology"]);
    expect(sharedInterests(EMPTY_PROFILE, project)).toEqual([]);
  });
});
