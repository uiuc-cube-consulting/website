/**
 * Who can see and fill which grid. These rules are the feature's whole privacy
 * story — a consultant must never read their own ratings, and a PM must never
 * read a project they aren't on.
 */

import {
  canAccessTracker,
  canRateProject,
  canViewProject,
  isExec,
} from "@/features/05-accountability-tracker/lib/access";
import { weekCompletion } from "@/features/05-accountability-tracker/lib/types";

const exec = { memberId: "e1", role: "exec" };
const pm = { memberId: "p1", role: "project_manager" };
const sc = { memberId: "s1", role: "senior_consultant" };
const returning = { memberId: "r1", role: "returning_member" };
const member = { memberId: "m1", role: "member" };

describe("canAccessTracker", () => {
  it("admits exec, PMs and SCs", () => {
    expect(canAccessTracker(exec)).toBe(true);
    expect(canAccessTracker(pm)).toBe(true);
    expect(canAccessTracker(sc)).toBe(true);
  });

  it("admits returning members, who can hold an SC seat without the title", () => {
    // FA26 has two of these (VerityXR, VoiceOS). Gating on title alone would
    // lock them out of the grid they are responsible for filling.
    expect(canAccessTracker(returning)).toBe(true);
  });

  it("keeps rank-and-file members out entirely", () => {
    expect(canAccessTracker(member)).toBe(false);
  });

  it("grants nothing on its own — reaching the page is not seeing a project", () => {
    // The whole reason widening the role gate is safe.
    expect(canViewProject(returning, null)).toBe(false);
    expect(canRateProject(returning, null)).toBe(false);
  });
});

describe("a returning member holding an SC seat", () => {
  it("can fill the grid for that project", () => {
    expect(canRateProject(returning, "senior_consultant")).toBe(true);
    expect(canViewProject(returning, "senior_consultant")).toBe(true);
  });

  it("still sees nothing on a project where they sit as a consultant", () => {
    expect(canViewProject(returning, "consultant")).toBe(false);
  });
});

describe("canRateProject", () => {
  it("lets exec correct any project without holding a seat", () => {
    expect(canRateProject(exec, null)).toBe(true);
  });

  it("lets the project's PM and SC rate it", () => {
    expect(canRateProject(pm, "project_manager")).toBe(true);
    expect(canRateProject(sc, "senior_consultant")).toBe(true);
  });

  it("refuses a PM who is not on this project", () => {
    // The org title is 'project_manager', but they hold no seat here.
    expect(canRateProject(pm, null)).toBe(false);
  });

  it("refuses someone sitting as a consultant, whatever their org role", () => {
    expect(canRateProject(pm, "consultant")).toBe(false);
    expect(canRateProject(member, "consultant")).toBe(false);
  });
});

describe("canViewProject", () => {
  it("gives reading exactly the same rule as writing", () => {
    // A consultant does not see their own ratings anywhere in the portal.
    expect(canViewProject(member, "consultant")).toBe(false);
    expect(canViewProject(pm, "consultant")).toBe(false);
    expect(canViewProject(sc, "senior_consultant")).toBe(true);
    expect(canViewProject(exec, null)).toBe(true);
  });
});

describe("isExec", () => {
  it("is true only for the exec role", () => {
    expect(isExec(exec)).toBe(true);
    expect(isExec(pm)).toBe(false);
  });
});

describe("weekCompletion", () => {
  const consultants = [{ member_id: "a" }, { member_id: "b" }];
  const cats = ["work_quality", "behavior", "initiative"] as const;
  const full = (member_id: string, week: number) =>
    cats.map((category) => ({ member_id, category, week }));

  it("requires every consultant in every category", () => {
    const rows = [...full("a", 1), ...full("b", 1)];
    expect(weekCompletion(consultants, rows, 1)).toEqual({ filled: 6, total: 6, complete: true });
  });

  it("counts a partial week as incomplete", () => {
    expect(weekCompletion(consultants, full("a", 1), 1)).toEqual({
      filled: 3,
      total: 6,
      complete: false,
    });
  });

  it("ignores other weeks", () => {
    const rows = [...full("a", 1), ...full("b", 1), ...full("a", 2)];
    expect(weekCompletion(consultants, rows, 2).filled).toBe(3);
  });

  it("ignores ratings for someone who has left the project", () => {
    // Otherwise a departed member's old rows could mark a week complete that
    // is missing a current consultant.
    const rows = [...full("a", 1), ...full("ghost", 1)];
    expect(weekCompletion(consultants, rows, 1)).toEqual({
      filled: 3,
      total: 6,
      complete: false,
    });
  });

  it("does not call an empty project complete", () => {
    // Reported incomplete because nothing was rated — but callers must not read
    // that as a MISSED week. A project still awaiting its roster has no work to
    // have skipped, which is why getOverview() guards missedWeeks on
    // consultants.length > 0 rather than trusting this flag alone.
    expect(weekCompletion([], [], 1)).toEqual({ filled: 0, total: 0, complete: false });
  });
});
