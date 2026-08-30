/**
 * Flags on the candidate LIST.
 *
 * A flag is one member's observation about a person — "no-showed three coffee
 * chats", "carried the case night" — and it lives on their profile with its
 * author and note. But the profile is a click away, and the two screens where
 * decisions actually happen are lists: the reviewer console and the exec
 * decision queue. A concern nobody notices while scanning 150 names may as well
 * not have been filed.
 *
 * These cover the counting the badge does, and the wiring that gets flags into
 * the decision queue at all. The badge's rendering is presentational; what must
 * not break is WHICH flags land on WHICH candidate, and that a pending flag —
 * filed against an email nobody has applied from — never attaches to anyone.
 */

import { buildDecisionQueue } from "@/features/03-recruitment-ats/lib/decision";
import type { Applicant, Flag, Review } from "@/features/03-recruitment-ats/lib/types";

function applicant(id: string, name: string): Applicant {
  return {
    id,
    name,
    email: `${id}@illinois.edu`,
    created_at: "2026-08-01",
    responses: {},
    stage: "applied",
    cycle: "fa26",
  };
}

function flag(over: Partial<Flag> = {}): Flag {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: "2026-08-20T00:00:00Z",
    applicant_id: "a1",
    subject_email: "a1@illinois.edu",
    submitter_email: "sam@illinois.edu",
    color: "green",
    description: "Ran the room through a case he'd prepped himself.",
    ...over,
  };
}

const APPLICANTS = [applicant("a1", "Alice"), applicant("a2", "Bob")];
const NO_REVIEWS: Review[] = [];

describe("flags reach the decision queue", () => {
  it("attaches each flag to its own candidate", () => {
    const rows = buildDecisionQueue(APPLICANTS, NO_REVIEWS, 2, [
      flag({ applicant_id: "a1", color: "green" }),
      flag({ applicant_id: "a1", color: "red" }),
      flag({ applicant_id: "a2", color: "green" }),
    ]);
    const byId = Object.fromEntries(rows.map((r) => [r.applicant.id, r]));
    expect(byId.a1.flags).toHaveLength(2);
    expect(byId.a2.flags).toHaveLength(1);
  });

  it("counts several people flagging the same candidate", () => {
    // The whole point of showing more than one glyph: two members raising a
    // concern independently is a different signal from one, and the queue has to
    // carry that distinction rather than collapsing it to "flagged".
    const rows = buildDecisionQueue(APPLICANTS, NO_REVIEWS, 2, [
      flag({ applicant_id: "a1", color: "red", submitter_email: "sam@illinois.edu" }),
      flag({ applicant_id: "a1", color: "red", submitter_email: "amy@illinois.edu" }),
      flag({ applicant_id: "a1", color: "red", submitter_email: "joe@illinois.edu" }),
    ]);
    const a1 = rows.find((r) => r.applicant.id === "a1")!;
    expect(a1.flags.filter((f) => f.color === "red")).toHaveLength(3);
  });

  it("never attaches a PENDING flag to anybody", () => {
    // A pending flag is filed against an email before any application exists.
    // Its applicant_id is null, and letting a null key match a candidate would
    // put a stranger's flag on someone's profile.
    const rows = buildDecisionQueue(APPLICANTS, NO_REVIEWS, 2, [
      flag({ applicant_id: null, subject_email: "nobody@illinois.edu" }),
    ]);
    expect(rows.every((r) => r.flags.length === 0)).toBe(true);
  });

  it("gives every candidate an array, flagged or not", () => {
    // So the badge can count without a null check on every row.
    const rows = buildDecisionQueue(APPLICANTS, NO_REVIEWS, 2, []);
    expect(rows.every((r) => Array.isArray(r.flags))).toBe(true);
  });

  it("defaults to no flags when none are passed", () => {
    // Back-compat: the argument is optional, and existing callers that omit it
    // must not break.
    const rows = buildDecisionQueue(APPLICANTS, NO_REVIEWS);
    expect(rows.every((r) => r.flags.length === 0)).toBe(true);
  });

  it("keeps flags out of the score", () => {
    // A flag is an observation, not a rating. Folding it into the mean would
    // launder one person's opinion into a number that looks like a measurement.
    const rows = buildDecisionQueue(APPLICANTS, NO_REVIEWS, 2, [
      flag({ applicant_id: "a1", color: "red" }),
      flag({ applicant_id: "a1", color: "red" }),
    ]);
    const a1 = rows.find((r) => r.applicant.id === "a1")!;
    expect(a1.mean).toBeNull();
    expect(a1.reviewCount).toBe(0);
    expect(a1.flags).toHaveLength(2);
  });
});
