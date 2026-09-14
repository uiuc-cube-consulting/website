/**
 * Point submissions — the catalog and the rules. The catalog is the exec
 * "Point Breakdowns" sheet; if these fail after an edit, check the sheet
 * before changing the test.
 */

import {
  POINT_CATEGORIES,
  POINT_EVENTS,
  SUBMITTER_ROLES,
  canSubmitPoints,
  cohortFor,
  emptyCategoryTotals,
  eventsIn,
  findEvent,
  isIsoDate,
  isPointCategory,
  ledgerReason,
  missingRequiredEvents,
  progressFor,
  repeatsLeft,
  repeatsUsed,
  validateSubmission,
  MAX_NOTE,
  type SubmissionLike,
  type SubmissionStatus,
} from "@/lib/point-catalog";
import { decodeEvidence, MAX_EVIDENCE_BYTES } from "@/lib/point-evidence";

const NOW = new Date("2026-09-13T18:00:00Z");

function sub(eventKey: string, status: SubmissionStatus = "pending"): SubmissionLike {
  const ev = findEvent(eventKey)!;
  return { event_key: ev.key, status, points: ev.points, category: ev.category };
}

function valid(over: Partial<{ event_key: unknown; occurred_on: unknown; note: unknown }> = {}) {
  return { event_key: "resume-review", occurred_on: "2026-09-12", note: null, ...over };
}

describe("catalog matches the Point Breakdowns sheet", () => {
  it("has six fundamentals, five professional and five social events", () => {
    expect(eventsIn("fundamentals")).toHaveLength(6);
    expect(eventsIn("professional")).toHaveLength(5);
    expect(eventsIn("social")).toHaveLength(5);
  });

  it("gives every event a unique key", () => {
    const keys = POINT_EVENTS.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("makes the mock case interview the only event worth more than one point", () => {
    expect(POINT_EVENTS.filter((e) => e.points !== 1).map((e) => [e.key, e.points])).toEqual([["mock-case", 2]]);
  });

  it("requires 5/6/5 from new members and 3/3/3 from returning members", () => {
    expect(POINT_CATEGORIES.map((c) => c.required)).toEqual([
      { new: 5, returning: 3 },
      { new: 6, returning: 3 },
      { new: 5, returning: 3 },
    ]);
  });

  it("makes every requirement reachable within the repeat limits", () => {
    for (const c of POINT_CATEGORIES) {
      const ceiling = eventsIn(c.key).reduce((n, e) => n + e.points * e.maxRepeats, 0);
      expect(ceiling).toBeGreaterThanOrEqual(c.required.new);
    }
  });

  it("marks every professional event required for the new cohort", () => {
    expect(eventsIn("professional").every((e) => e.requiredForNewCohort)).toBe(true);
    expect(eventsIn("social").some((e) => e.requiredForNewCohort)).toBe(false);
  });

  it("recognises exactly the three categories", () => {
    expect(isPointCategory("fundamentals")).toBe(true);
    expect(isPointCategory("professional")).toBe(true);
    expect(isPointCategory("social")).toBe(true);
    expect(isPointCategory("leadership")).toBe(false);
    expect(isPointCategory(null)).toBe(false);
  });
});

describe("who submits", () => {
  it("is project managers, senior consultants, returning members and members", () => {
    expect([...SUBMITTER_ROLES].sort()).toEqual(["member", "project_manager", "returning_member", "senior_consultant"]);
    for (const role of SUBMITTER_ROLES) expect(canSubmitPoints(role)).toBe(true);
  });

  it("excludes exec, and a session with no role or an unknown one", () => {
    expect(canSubmitPoints("exec")).toBe(false);
    expect(canSubmitPoints(undefined)).toBe(false);
    expect(canSubmitPoints("")).toBe(false);
    expect(canSubmitPoints("alumni")).toBe(false);
  });
});

describe("cohort", () => {
  it("treats `member` as the new cohort and every other role as returning", () => {
    expect(cohortFor("member")).toBe("new");
    expect(cohortFor("returning_member")).toBe("returning");
    expect(cohortFor("project_manager")).toBe("returning");
    expect(cohortFor("senior_consultant")).toBe("returning");
  });
});

describe("repeat limits", () => {
  it("counts pending and approved submissions but not rejected ones", () => {
    const subs = [sub("exec-1on1", "pending"), sub("exec-1on1", "approved"), sub("exec-1on1", "rejected")];
    expect(repeatsUsed(subs, "exec-1on1")).toBe(2);
    expect(repeatsLeft(findEvent("exec-1on1")!, subs)).toBe(1);
  });

  it("never goes below zero", () => {
    const subs = [sub("linkedin-review", "approved"), sub("linkedin-review", "approved")];
    expect(repeatsLeft(findEvent("linkedin-review")!, subs)).toBe(0);
  });
});

describe("validateSubmission", () => {
  it("accepts a valid submission and resolves the event from the catalog", () => {
    const result = validateSubmission(valid({ note: "  with Jonah  " }), [], NOW);
    expect(result).toEqual({ ok: true, event: findEvent("resume-review"), occurredOn: "2026-09-12", note: "with Jonah" });
  });

  it("rejects an event that isn't in the catalog", () => {
    expect(validateSubmission(valid({ event_key: "free-points" }), [], NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it.each(["", "09/12/2026", "2026-02-30", "2026-13-01", 20260912])("rejects the date %p", (date) => {
    expect(validateSubmission(valid({ occurred_on: date }), [], NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects a future date, with a day of slack for Central time", () => {
    expect(validateSubmission(valid({ occurred_on: "2026-09-14" }), [], NOW).ok).toBe(true);
    expect(validateSubmission(valid({ occurred_on: "2026-09-15" }), [], NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it("stores a blank note as null and refuses an overlong one", () => {
    expect(validateSubmission(valid({ note: "   " }), [], NOW)).toMatchObject({ ok: true, note: null });
    expect(validateSubmission(valid({ note: "x".repeat(MAX_NOTE + 1) }), [], NOW)).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses once the event's limit is used, and frees the slot on rejection", () => {
    const used = [sub("linkedin-review", "pending")];
    expect(validateSubmission(valid({ event_key: "linkedin-review" }), used, NOW)).toMatchObject({ ok: false, status: 409 });

    const rejected = [sub("linkedin-review", "rejected")];
    expect(validateSubmission(valid({ event_key: "linkedin-review" }), rejected, NOW).ok).toBe(true);
  });
});

describe("progress", () => {
  it("takes approved points from the ledger and pending points from submissions", () => {
    // The ledger already holds the approved mock case (2) plus a professional
    // point exec awarded by hand. The approved submission must not be counted
    // a second time on top of it.
    const ledger = { ...emptyCategoryTotals(), professional: 3 };
    const subs = [sub("mock-case", "approved"), sub("resume-review", "pending"), sub("cube-social", "rejected")];
    const [fundamentals, professional, social] = progressFor("new", ledger, subs);
    expect(fundamentals).toMatchObject({ approved: 0, pending: 0, required: 5 });
    expect(professional).toMatchObject({ approved: 3, pending: 1, required: 6 });
    expect(social).toMatchObject({ approved: 0, pending: 0, required: 5 });
  });

  it("uses the returning-member requirement for returning members", () => {
    expect(progressFor("returning", emptyCategoryTotals(), []).map((p) => p.required)).toEqual([3, 3, 3]);
  });

  it("lists the required events a new member hasn't submitted, and none for returning members", () => {
    const missing = missingRequiredEvents("new", [sub("resume-review"), sub("mock-case", "rejected")]).map((e) => e.key);
    expect(missing).not.toContain("resume-review");
    expect(missing).toContain("mock-case");
    expect(missingRequiredEvents("returning", [])).toEqual([]);
  });
});

describe("ledger reason", () => {
  it("names the category and event", () => {
    expect(ledgerReason({ category: "professional", event_label: "Resume review" })).toBe("Professional: Resume review");
  });
});

describe("isIsoDate", () => {
  it("accepts real calendar dates only", () => {
    expect(isIsoDate("2026-09-13")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });
});

describe("decodeEvidence", () => {
  const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  it("accepts a JPEG and a PNG", () => {
    expect(decodeEvidence(`data:image/jpeg;base64,${b64(JPEG)}`)).toMatchObject({ ok: true, mime: "image/jpeg" });
    expect(decodeEvidence(`data:image/png;base64,${b64(PNG)}`)).toMatchObject({ ok: true, mime: "image/png" });
  });

  it("requires a photo", () => {
    expect(decodeEvidence(undefined)).toEqual({ ok: false, error: "Attach a photo of you at the event." });
    expect(decodeEvidence("")).toMatchObject({ ok: false });
  });

  it("refuses SVG, which would run script when served inline", () => {
    const svg = Buffer.from("<svg onload=alert(1)>").toString("base64");
    expect(decodeEvidence(`data:image/svg+xml;base64,${svg}`)).toMatchObject({ ok: false });
  });

  it("refuses a payload whose bytes don't match its declared type", () => {
    const html = Buffer.from("<html><script>").toString("base64");
    expect(decodeEvidence(`data:image/png;base64,${html}`)).toMatchObject({ ok: false });
    expect(decodeEvidence(`data:image/png;base64,${b64(JPEG)}`)).toMatchObject({ ok: false });
  });

  it("refuses an oversized photo before decoding it", () => {
    const huge = "A".repeat(Math.ceil((MAX_EVIDENCE_BYTES * 4) / 3) + 8);
    expect(decodeEvidence(`data:image/jpeg;base64,${huge}`)).toEqual({
      ok: false,
      error: "That photo is too large. Try a smaller one.",
    });
  });
});
