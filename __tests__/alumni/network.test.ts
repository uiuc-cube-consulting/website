import { buildNetwork, parseReview, type SharedProfile, type Review } from "@/features/09-cube-network/lib/network";
import { filterAlumni, needsDirectoryReview, type Alumnus } from "@/features/07-alumni-directory/lib/alumni";
import { EMPTY_PROFILE, parseProfile, type Member } from "@/features/08-member-matching/lib/model";
const ID = "10000000-0000-4000-8000-000000000001";
const member: Member = { id: ID, full_name: "Example Member", email: "member@example.com", role: "member", cohort: "TEST" };
const profile: SharedProfile = { ...EMPTY_PROFILE, member_id: ID, updated_at: "2026-10-30T00:00:00Z", major: "Information Sciences", linkedin: "https://www.linkedin.com/in/example-member/", interests: ["Technology"], skills: ["Python"], directory_visible: false, share_email: false, open_to_mentor: false };
const alumnus: Alumnus = { id: "20000000-0000-4000-8000-000000000001", full_name: "Example Alum", linkedin_url: "https://www.linkedin.com/in/example-alum/", headline: null, company: null, position: null, major: null, email: null, phone: null, campus_status: "unknown", open_to_mentor: true, source: "manual", updated_at: "2026-10-30T00:00:00Z" };
const review: Review = { member_id: ID, alumni_id: null, linkedin_snapshot: profile.linkedin, identity_status: "evidence_found", uiuc_status: "evidence_found", source_url: profile.linkedin, notes: "Private exec note", checked_at: "2026-10-30T00:00:00Z" };
it("includes every roster member and exec without a shared profile", () => {
  const rows = buildNetwork([member, { ...member, id: "another", role: "exec" }], [], [], [], false);
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.membership)).toEqual(["member", "exec"]);
  expect(rows[0].campus_status).toBe("unknown");
  expect(rows[0].email).toBeNull();
});
it("shares no personal fields, mentor flag, email or review source without opt-in", () => {
  const row = buildNetwork([member], [{ ...profile, open_to_mentor: true, share_email: true }], [], [review], false)[0];
  expect(row).toMatchObject({ major: null, interests: [], skills: [], linkedin_url: null, email: null, phone: null, open_to_mentor: false, review: null });
  expect(row).not.toHaveProperty("learning_goals");
  expect(row).not.toHaveProperty("bio");
});
it("shares selected fields but email needs its own opt-in", () => {
  const row = buildNetwork([member], [{ ...profile, directory_visible: true, open_to_mentor: true }], [], [], false)[0];
  expect(row.major).toBe(profile.major);
  expect(row.interests).toEqual(profile.interests);
  expect(row.open_to_mentor).toBe(true);
  expect(row.email).toBeNull();
  expect(buildNetwork([member], [{ ...profile, directory_visible: true, share_email: true }], [], [], false)[0].email).toBe(member.email);
});
it("does not duplicate current people into alumni when exact email or LinkedIn matches", () => {
  expect(buildNetwork([member], [profile], [{ ...alumnus, email: "MEMBER@example.com" }], [], false)).toHaveLength(1);
  expect(buildNetwork([member], [profile], [{ ...alumnus, linkedin_url: profile.linkedin }], [], false)).toHaveLength(1);
});
it("does not merge namesakes on name alone", () => {
  expect(buildNetwork([member], [], [{ ...alumnus, full_name: member.full_name! }], [], false)).toHaveLength(2);
});
it("invalidates a source review when the linked profile changes", () => {
  const row = buildNetwork([member], [{ ...profile, directory_visible: true, linkedin: "https://www.linkedin.com/in/new-example/" }], [], [review], false)[0];
  expect(row.review).toBeNull();
});
it("keeps exec-only review notes off member responses", () => {
  const publicRow = buildNetwork([member], [{ ...profile, directory_visible: true }], [], [review], false)[0];
  expect(publicRow.review?.notes).toBeUndefined();
  const execRow = buildNetwork([member], [{ ...profile, directory_visible: true }], [], [review], true)[0];
  expect(execRow.review?.notes).toBe("Private exec note");
});
it("filters membership, opted-in mentors, interests and skills", () => {
  const rows = buildNetwork([member], [{ ...profile, directory_visible: true, open_to_mentor: true }], [alumnus], [], false);
  expect(filterAlumni(rows, { membership: "member", mentorsOnly: true, interest: "Technology", query: "Python" })).toHaveLength(1);
  expect(filterAlumni(rows, { membership: "exec" })).toHaveLength(0);
  expect(filterAlumni(rows, { membership: "alumni" })).toHaveLength(1);
});
it("never equates recent editing with verified identity or education", () => {
  expect(needsDirectoryReview(alumnus, Date.parse("2026-10-30"))).toBe(true);
  const row = { ...alumnus, review };
  expect(needsDirectoryReview(row, Date.parse("2026-10-30"))).toBe(false);
  expect(needsDirectoryReview(row, Date.parse("2027-10-30"))).toBe(true);
});
const input = { target_kind: "member", target_id: ID, identity_status: "evidence_found", uiuc_status: "evidence_found", source_url: "https://siebelschool.illinois.edu/example", notes: "Matched by source" };
it("requires explicit, supported evidence review statuses and a safe source", () => {
  expect(parseReview(input)).toMatchObject(input);
  for (const source_url of ["", "javascript:alert(1)", "https://illinois.edu.evil.test", "https://example.com", "https://user:pass@illinois.edu/page"]) {
    expect(() => parseReview({ ...input, source_url })).toThrow();
  }
  expect(() => parseReview({ ...input, uiuc_status: "degree_verified" })).toThrow();
  expect(() => parseReview({ ...input, notes: "x".repeat(601) })).toThrow();
  expect(parseReview({ ...input, actor: "someone-else" })).not.toHaveProperty("actor");
});
it("does not accept misleading consent values or contact sharing without directory opt-in", () => {
  expect(() => parseProfile({ ...EMPTY_PROFILE, directory_visible: "yes" })).toThrow();
  expect(() => parseProfile({ ...EMPTY_PROFILE, share_email: true })).toThrow();
  expect(() => parseProfile({ ...EMPTY_PROFILE, open_to_mentor: true })).toThrow();
  expect(() => parseProfile({ ...EMPTY_PROFILE, linkedin: "https://example.com/wrong" })).toThrow();
  expect(parseProfile({ ...EMPTY_PROFILE, linkedin: "https://linkedin.com/in/example-member?utm=x" }).linkedin).toBe("https://www.linkedin.com/in/example-member/");
});
