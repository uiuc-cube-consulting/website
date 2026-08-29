/**
 * You never see your own application.
 *
 * Almost every member applied to CUBE, so almost every member has a row in
 * `applicants` keyed by the email they now sign in with — carrying their essay
 * answers, the marks two reviewers gave them, and whatever exec wrote next to
 * the decision. Recruiting reads are club-wide by design, which makes that row
 * the one thing the pipeline must withhold from exactly one person.
 *
 * These tests pin the rule and its three deliberate properties: no exec bypass,
 * every cycle rather than only closed ones, and reads and writes alike.
 */

import {
  SELF_ACCESS_DENIED,
  excludeOwnApplications,
  excludeRowsForOwnApplications,
  hasOwnApplication,
  isOwnApplication,
  ownApplicationIds,
} from "@/features/03-recruitment-ats/lib/self-access";

const MEMBER = "jane@illinois.edu";

/** Jane joined after applying in fa26 and is applying again in sp27. */
const APPLICANTS = [
  { id: "app-jane-fa26", email: "jane@illinois.edu", cycle: "fa26" },
  { id: "app-jane-sp27", email: "Jane@Illinois.edu", cycle: "sp27" },
  { id: "app-bob", email: "bob@illinois.edu", cycle: "sp27" },
  { id: "app-cara", email: "cara@illinois.edu", cycle: "fa26" },
];

describe("isOwnApplication", () => {
  it("matches the viewer's own application", () => {
    expect(isOwnApplication(MEMBER, "jane@illinois.edu")).toBe(true);
  });

  it("ignores case and surrounding whitespace on both sides", () => {
    // The member signs in through Google and the applicant typed their address
    // into a form months earlier. Neither is normalised at the source.
    expect(isOwnApplication("Jane@Illinois.edu", "jane@illinois.edu")).toBe(true);
    expect(isOwnApplication(" jane@illinois.edu ", "JANE@ILLINOIS.EDU")).toBe(true);
  });

  it("does not match anyone else", () => {
    expect(isOwnApplication(MEMBER, "bob@illinois.edu")).toBe(false);
    // A substring or prefix is not a match.
    expect(isOwnApplication(MEMBER, "jane@illinois.edu.au")).toBe(false);
    expect(isOwnApplication("jane", "jane@illinois.edu")).toBe(false);
  });

  it("is false when either side has no address", () => {
    // An anonymous viewer is nobody's self, and a row with no address cannot be
    // shown to be yours.
    expect(isOwnApplication(null, "jane@illinois.edu")).toBe(false);
    expect(isOwnApplication(MEMBER, null)).toBe(false);
    expect(isOwnApplication("", "")).toBe(false);
    expect(isOwnApplication(undefined, undefined)).toBe(false);
  });
});

describe("excludeOwnApplications", () => {
  it("removes every application the viewer filed, across all cycles", () => {
    // Not just the closed one. A member applying again while holding a role must
    // not watch their own live application being scored.
    const visible = excludeOwnApplications(MEMBER, APPLICANTS, (a) => a.email);
    expect(visible.map((a) => a.id)).toEqual(["app-bob", "app-cara"]);
  });

  it("leaves other people's applications untouched", () => {
    const visible = excludeOwnApplications("nobody@illinois.edu", APPLICANTS, (a) => a.email);
    expect(visible).toHaveLength(4);
  });

  it("works over any projection of an applicant, not just the raw row", () => {
    // The same redaction runs over the reviewer aggregate, the coverage table
    // and the interview board, which nest the applicant differently.
    const aggregates = APPLICANTS.map((a) => ({ applicant: a, mean: 4.2 }));
    const visible = excludeOwnApplications(MEMBER, aggregates, (r) => r.applicant.email);
    expect(visible.map((r) => r.applicant.id)).toEqual(["app-bob", "app-cara"]);
  });

  it("hides nothing when there is no viewer to compare against", () => {
    expect(excludeOwnApplications(null, APPLICANTS, (a) => a.email)).toHaveLength(4);
  });
});

describe("ownApplicationIds", () => {
  it("resolves every application id belonging to the viewer", () => {
    expect(ownApplicationIds(MEMBER, APPLICANTS)).toEqual(
      new Set(["app-jane-fa26", "app-jane-sp27"])
    );
  });

  it("is empty for someone who never applied", () => {
    expect(ownApplicationIds("newcomer@illinois.edu", APPLICANTS).size).toBe(0);
    expect(ownApplicationIds(null, APPLICANTS).size).toBe(0);
  });
});

describe("excludeRowsForOwnApplications", () => {
  // Reviews, assignments, decisions, flags and panels carry an applicant_id and
  // no email, so they can only be redacted by id.
  const reviews = [
    { id: "r1", applicant_id: "app-jane-fa26", reviewer_email: "sam@illinois.edu", weighted_total: 2.5 },
    { id: "r2", applicant_id: "app-jane-sp27", reviewer_email: "amy@illinois.edu", weighted_total: 3.0 },
    { id: "r3", applicant_id: "app-bob", reviewer_email: "sam@illinois.edu", weighted_total: 4.5 },
  ];

  it("removes the scores given to the viewer's own applications", () => {
    const ids = ownApplicationIds(MEMBER, APPLICANTS);
    const visible = excludeRowsForOwnApplications(reviews, ids);
    expect(visible.map((r) => r.id)).toEqual(["r3"]);
  });

  it("keeps everything when the viewer never applied", () => {
    expect(excludeRowsForOwnApplications(reviews, new Set())).toHaveLength(3);
  });

  it("keeps rows not attached to any application", () => {
    // A pending flag has no applicant_id yet; it is nobody's application row.
    const pending = [{ id: "f1", applicant_id: null }];
    expect(excludeRowsForOwnApplications(pending, new Set(["app-jane-fa26"]))).toHaveLength(1);
  });
});

describe("hasOwnApplication", () => {
  it("knows the viewer is in the pipeline without revealing anything about it", () => {
    expect(hasOwnApplication(MEMBER, APPLICANTS)).toBe(true);
    expect(hasOwnApplication("newcomer@illinois.edu", APPLICANTS)).toBe(false);
  });
});

describe("the rule has no exec bypass", () => {
  it("redacts identically whatever the viewer's role is", () => {
    // Every other gate in lib/access.ts lets exec through so a stuck queue can
    // be unblocked. There is nothing to unblock here: the point is to withhold
    // information from one person, and that person being exec makes the leak
    // worse, not more legitimate. The predicates take no role at all, which is
    // what makes the bypass impossible rather than merely absent.
    expect(isOwnApplication.length).toBe(2); // (viewerEmail, applicantEmail) — no role
    expect(excludeOwnApplications(MEMBER, APPLICANTS, (a) => a.email).map((a) => a.id)).toEqual([
      "app-bob",
      "app-cara",
    ]);
  });
});

describe("SELF_ACCESS_DENIED", () => {
  it("explains the refusal instead of reading like a bug", () => {
    // A member who hits this should understand it is policy, not breakage, and
    // not file it as one.
    expect(SELF_ACCESS_DENIED).toMatch(/your own application/i);
    expect(SELF_ACCESS_DENIED).toMatch(/isn't visible to you/i);
  });
});

describe("end to end: a member who applied twice", () => {
  it("sees the cohort with both of their own applications removed", () => {
    // Jane is a member now. She was scored 2.5 in fa26 and is being scored again
    // in sp27. Neither row, and neither set of marks, is hers to read.
    const ownIds = ownApplicationIds(MEMBER, APPLICANTS);
    const visibleApplicants = excludeOwnApplications(MEMBER, APPLICANTS, (a) => a.email);
    const visibleReviews = excludeRowsForOwnApplications(
      [
        { id: "r1", applicant_id: "app-jane-fa26" },
        { id: "r2", applicant_id: "app-jane-sp27" },
        { id: "r3", applicant_id: "app-bob" },
      ],
      ownIds
    );

    expect(visibleApplicants.some((a) => a.email.toLowerCase() === MEMBER)).toBe(false);
    expect(visibleReviews.some((r) => ownIds.has(r.applicant_id))).toBe(false);
    // Bob's application is untouched — this hides your own file, not the pipeline.
    expect(visibleApplicants.map((a) => a.id)).toContain("app-bob");
    expect(visibleReviews.map((r) => r.id)).toContain("r3");
  });
});
