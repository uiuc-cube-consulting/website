/**
 * Pending ("event") flags: filed against a bare email before anyone applies, then
 * claimed onto the applicant the moment an application arrives.
 *
 * Three things are worth pinning down, and they are the three that break quietly:
 *   1. the MATCH RULE — a flag filed as "R.Kapoor@Illinois.edu " must find an
 *      applicant who applies as "rkapoor@illinois.edu", and must not find anyone
 *      else. This is the whole feature; if matching is wrong the flag is silently
 *      lost rather than visibly broken.
 *   2. the CLAIM happening on EVERY path into the applicant table, not just the
 *      public form — most applicants arrive through the bulk sheet import.
 *   3. the VISIBILITY carve-out — filing by email works while recruiting is
 *      CLOSED (that is the point: info nights happen between cycles), while
 *      anything that reads the applicant pool stays gated.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSession: { user: { email: string; role: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

let recruitingVisible = true;
jest.mock("@/features/03-recruitment-ats/lib/visibility", () => ({
  canViewRecruiting: jest.fn(async (role: string) => role === "exec" || recruitingVisible),
  // The route stamps a by-email flag with the cycle whose application it should
  // attach to, so the flag lands on the cohort screening this person now rather
  // than on the row they were rejected in last year.
  getActiveCycle: jest.fn(async () => "fa26"),
}));

const stub = {
  submitFlag: jest.fn(async () => ({ ok: true, linked: false })),
  // Annotated rather than inferred: an empty literal infers `never[]`, and every
  // redaction case below then fails to typecheck while still passing at runtime.
  getPendingFlags: jest.fn(async (): Promise<{ flags: Flag[]; demo: boolean }> => ({
    flags: [],
    demo: false,
  })),
};
jest.mock("@/features/03-recruitment-ats/lib/store", () => ({
  submitFlag: (...a: unknown[]) => stub.submitFlag(...(a as [])),
  getPendingFlags: (...a: unknown[]) => stub.getPendingFlags(...(a as [])),
}));

// Only the DB-backed half is stubbed. `isOwnApplication` stays REAL, because the
// email comparison it performs is the actual thing under test in the redaction
// cases below — mocking it would assert that the route calls a function, not
// that the flag is withheld.
const ownApplicationIds = new Set<string>();
jest.mock("@/features/03-recruitment-ats/lib/self-access-store", () => ({
  isOwnApplicationId: jest.fn(async (id: string) => ownApplicationIds.has(id)),
}));

import { NextRequest } from "next/server";
import {
  POST as flagsPOST,
  GET as flagsGET,
} from "@/features/03-recruitment-ats/app/api/recruitment/flags/route";
import {
  isPendingFlag,
  normalizeSubject,
  partitionFlags,
  pendingFlagsFor,
  wasFiledBeforeApplying,
  type Flag,
} from "@/features/03-recruitment-ats/lib/types";

function flag(over: Partial<Flag> = {}): Flag {
  return {
    id: Math.random().toString(36).slice(2),
    created_at: "2026-08-25T02:30:00Z",
    applicant_id: null,
    subject_email: "rkapoor@illinois.edu",
    submitter_email: "sujan@cubeconsulting.org",
    color: "green",
    description: "Ran the room through a case he'd prepped himself.",
    ...over,
  };
}

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/recruitment/flags", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockSession = { user: { email: "member@illinois.edu", role: "member" } };
  recruitingVisible = true;
  stub.submitFlag.mockClear();
  stub.getPendingFlags.mockClear();
  stub.submitFlag.mockResolvedValue({ ok: true, linked: false });
  ownApplicationIds.clear();
});

// ── 1. The match rule ────────────────────────────────────────────────────────

describe("matching a pending flag to an applicant", () => {
  it("matches regardless of case and surrounding whitespace", () => {
    // Somebody types the flag at an info night; the applicant types their own
    // address into the form weeks later. Neither is canonicalized by hand.
    const pool = [flag({ subject_email: "rkapoor@illinois.edu" })];
    expect(pendingFlagsFor(pool, "  RKapoor@Illinois.EDU ")).toHaveLength(1);
  });

  it("does not match a different address that merely looks similar", () => {
    const pool = [flag({ subject_email: "rkapoor@illinois.edu" })];
    expect(pendingFlagsFor(pool, "r.kapoor@illinois.edu")).toHaveLength(0);
    expect(pendingFlagsFor(pool, "rkapoor2@illinois.edu")).toHaveLength(0);
    expect(pendingFlagsFor(pool, "rkapoor@gmail.com")).toHaveLength(0);
  });

  it("collects every pending flag on the same person, not just the first", () => {
    const pool = [
      flag({ subject_email: "rkapoor@illinois.edu", color: "green" }),
      flag({ subject_email: "rkapoor@illinois.edu", color: "red" }),
      flag({ subject_email: "someone.else@illinois.edu" }),
    ];
    expect(pendingFlagsFor(pool, "rkapoor@illinois.edu")).toHaveLength(2);
  });

  it("never claims a flag that is already attached to somebody", () => {
    // The failure this guards: a re-run of the claim, or a second applicant with
    // the same address, stealing a flag off an existing profile.
    const pool = [flag({ subject_email: "rkapoor@illinois.edu", applicant_id: "a1" })];
    expect(pendingFlagsFor(pool, "rkapoor@illinois.edu")).toHaveLength(0);
  });

  it("matches nobody on a blank email rather than everybody", () => {
    const pool = [flag(), flag({ subject_email: "other@illinois.edu" })];
    expect(pendingFlagsFor(pool, "")).toHaveLength(0);
    expect(pendingFlagsFor(pool, "   ")).toHaveLength(0);
  });

  it("normalizes and partitions consistently", () => {
    expect(normalizeSubject("  A@B.COM ")).toBe("a@b.com");
    const { linked, pending } = partitionFlags([flag(), flag({ applicant_id: "a1" })]);
    expect(pending).toHaveLength(1);
    expect(linked).toHaveLength(1);
    expect(isPendingFlag(pending[0])).toBe(true);
  });
});

describe("telling an event flag from a review-time flag", () => {
  it("marks a flag claimed long after it was written as pre-application", () => {
    expect(
      wasFiledBeforeApplying(
        flag({
          applicant_id: "a1",
          created_at: "2026-08-25T02:30:00Z",
          linked_at: "2026-09-02T16:30:00Z",
        })
      )
    ).toBe(true);
  });

  it("does not mark a flag filed straight onto a candidate's profile", () => {
    // Written and linked in the same operation — timestamps a few ms apart.
    expect(
      wasFiledBeforeApplying(
        flag({
          applicant_id: "a1",
          created_at: "2026-09-06T01:00:00.000Z",
          linked_at: "2026-09-06T01:00:00.120Z",
        })
      )
    ).toBe(false);
  });

  it("does not mark a still-pending flag", () => {
    expect(wasFiledBeforeApplying(flag())).toBe(false);
  });
});

// ── 2. Filing by email ───────────────────────────────────────────────────────

describe("POST /api/recruitment/flags — by email", () => {
  it("accepts an email with no applicant and lowercases the subject", async () => {
    const res = await flagsPOST(
      post({
        subject_email: "  RKapoor@Illinois.EDU ",
        subject_name: "Rohan Kapoor",
        event: "Fall Info Night",
        color: "green",
        description: "Sharpest question of the night.",
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(stub.submitFlag).toHaveBeenCalledWith(
      expect.objectContaining({
        applicant_id: null,
        subject_email: "rkapoor@illinois.edu",
        subject_name: "Rohan Kapoor",
        event: "Fall Info Night",
        submitter_email: "member@illinois.edu",
        color: "green",
      })
    );
  });

  it("still supports the original applicant_id shape", async () => {
    await flagsPOST(post({ applicant_id: "a1", color: "red", description: "Late, no heads-up." }));
    expect(stub.submitFlag).toHaveBeenCalledWith(
      expect.objectContaining({ applicant_id: "a1", subject_email: null, color: "red" })
    );
  });

  it("refuses a body naming neither an applicant nor an email", async () => {
    const res = await flagsPOST(post({ color: "red", description: "…" }));
    expect(res.status).toBe(400);
    expect(stub.submitFlag).not.toHaveBeenCalled();
  });

  it("refuses a malformed email", async () => {
    const res = await flagsPOST(post({ subject_email: "rkapoor", color: "red", description: "…" }));
    expect(res.status).toBe(400);
    expect(stub.submitFlag).not.toHaveBeenCalled();
  });

  it("still requires a colour and a description", async () => {
    const a = await flagsPOST(post({ subject_email: "r@illinois.edu", color: "blue", description: "x" }));
    expect(a.status).toBe(400);
    const b = await flagsPOST(post({ subject_email: "r@illinois.edu", color: "red", description: "   " }));
    expect(b.status).toBe(400);
    expect(stub.submitFlag).not.toHaveBeenCalled();
  });
});

// ── 3. The visibility carve-out ──────────────────────────────────────────────

describe("filing while recruiting is closed", () => {
  beforeEach(() => {
    recruitingVisible = false;
  });

  it("lets a plain member flag by email — the between-cycles case", async () => {
    const res = await flagsPOST(
      post({ subject_email: "r@illinois.edu", color: "green", description: "Great at the callout." })
    );
    expect(res.status).toBe(200);
    expect(stub.submitFlag).toHaveBeenCalled();
  });

  it("refuses flagging a known applicant, which would confirm they applied", async () => {
    const res = await flagsPOST(post({ applicant_id: "a1", color: "red", description: "…" }));
    expect(res.status).toBe(403);
    expect(stub.submitFlag).not.toHaveBeenCalled();
  });

  it("withholds whether the email is already in the pipeline", async () => {
    stub.submitFlag.mockResolvedValue({ ok: true, linked: true });
    const res = await flagsPOST(
      post({ subject_email: "r@illinois.edu", color: "green", description: "…" })
    );
    // The flag IS linked server-side; the caller just isn't told, because that
    // answer is "this person applied" and recruiting is closed to them.
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("reports the link to exec once recruiting is open again", async () => {
    recruitingVisible = true;
    mockSession = { user: { email: "exec@illinois.edu", role: "exec" } };
    stub.submitFlag.mockResolvedValue({ ok: true, linked: true });
    const res = await flagsPOST(
      post({ subject_email: "r@illinois.edu", color: "green", description: "…" })
    );
    await expect(res.json()).resolves.toEqual({ ok: true, linked: true });
  });
});

// ── The final-round roster oracle ────────────────────────────────────────────
//
// GET /api/recruitment/applicants hides `final_round` applicants from everyone
// but exec, because knowing who is still in it a week before offers is most of
// the information. `submitFlag` matches by email across every stage, so echoing
// `linked` back to a non-exec member reconstructs that roster by elimination:
// an address missing from your dashboard that still reports `linked: true` is
// someone in the final round. These pin the field to exec.

describe("whether the flag linked is not broadcast", () => {
  beforeEach(() => {
    stub.submitFlag.mockResolvedValue({ ok: true, linked: true });
  });

  const body = () => post({ subject_email: "r@illinois.edu", color: "green", description: "…" });

  it("withholds the link from every non-exec role, recruiting open", async () => {
    for (const role of ["member", "returning_member", "senior_consultant", "project_manager"]) {
      mockSession = { user: { email: `${role}@illinois.edu`, role } };
      await expect((await flagsPOST(body())).json()).resolves.toEqual({ ok: true });
    }
  });

  it("still records the flag — only the answer is withheld, not the write", async () => {
    mockSession = { user: { email: "member@illinois.edu", role: "member" } };
    const res = await flagsPOST(body());
    expect(res.status).toBe(200);
    expect(stub.submitFlag).toHaveBeenCalled();
  });

  it("tells exec, who can already see the whole pool", async () => {
    mockSession = { user: { email: "exec@illinois.edu", role: "exec" } };
    await expect((await flagsPOST(body())).json()).resolves.toEqual({ ok: true, linked: true });
  });

  it("does not leak by the shape of a negative answer either", async () => {
    // A non-exec must get byte-identical responses whether or not the email
    // matched, or the absence of a field is itself the oracle.
    mockSession = { user: { email: "member@illinois.edu", role: "member" } };
    const hit = await (await flagsPOST(body())).json();
    stub.submitFlag.mockResolvedValue({ ok: true, linked: false });
    const miss = await (await flagsPOST(body())).json();
    expect(hit).toEqual(miss);
  });
});

// ── 4. Who may file and read ─────────────────────────────────────────────────

describe("access", () => {
  it("refuses anonymous callers", async () => {
    mockSession = null;
    expect((await flagsPOST(post({ subject_email: "r@illinois.edu", color: "red", description: "x" }))).status).toBe(401);
    expect((await flagsGET()).status).toBe(401);
  });

  it("refuses a signed-in non-member role", async () => {
    mockSession = { user: { email: "outsider@illinois.edu", role: "alumni" } };
    expect((await flagsPOST(post({ subject_email: "r@illinois.edu", color: "red", description: "x" }))).status).toBe(403);
    expect((await flagsGET()).status).toBe(403);
  });

  it("lets every member role read the pending pool, closed or not", async () => {
    recruitingVisible = false;
    for (const role of ["member", "returning_member", "senior_consultant", "project_manager", "exec"]) {
      mockSession = { user: { email: `${role}@illinois.edu`, role } };
      expect((await flagsGET()).status).toBe(200);
    }
  });
});

// ── 5. You are not allowed to read, or write, flags about yourself ───────────
//
// The pending pool is the one surface where a flag is visible WITHOUT going
// through an applicant row, so the self-access rule that protects application
// files has to be re-stated here or it has a hole exactly the shape of this
// feature: sign in, open /portal/flags, read what a teammate wrote about you
// after you no-showed their coffee chat.

describe("flags about the viewer themselves", () => {
  const ME = "member@illinois.edu";

  it("withholds a pending flag whose subject is the viewer", async () => {
    stub.getPendingFlags.mockResolvedValue({
      flags: [flag({ subject_email: ME, color: "red", description: "No-showed three chats." })],
      demo: false,
    });
    const body = await (await flagsGET()).json();
    expect(body.flags).toHaveLength(0);
  });

  it("matches the viewer case-insensitively, the way every other email does", async () => {
    stub.getPendingFlags.mockResolvedValue({
      flags: [flag({ subject_email: "Member@Illinois.EDU" })],
      demo: false,
    });
    const body = await (await flagsGET()).json();
    expect(body.flags).toHaveLength(0);
  });

  it("still shows flags about other people", async () => {
    stub.getPendingFlags.mockResolvedValue({
      flags: [flag({ subject_email: ME }), flag({ subject_email: "someone@illinois.edu" })],
      demo: false,
    });
    const body = await (await flagsGET()).json();
    expect(body.flags).toHaveLength(1);
    expect(body.flags[0].subject_email).toBe("someone@illinois.edu");
  });

  it("redacts by SUBJECT, not by submitter — your own filings stay visible", async () => {
    // The filter is easy to write against the wrong column, and getting it wrong
    // this way is silent: the pool simply empties out for whoever is most active.
    stub.getPendingFlags.mockResolvedValue({
      flags: [flag({ subject_email: "someone@illinois.edu", submitter_email: ME })],
      demo: false,
    });
    const body = await (await flagsGET()).json();
    expect(body.flags).toHaveLength(1);
  });

  it("has no exec bypass", async () => {
    // Deliberately unlike every other gate in lib/access.ts. There is no stuck
    // queue to unblock here, and the person being exec makes the leak worse.
    mockSession = { user: { email: ME, role: "exec" } };
    stub.getPendingFlags.mockResolvedValue({ flags: [flag({ subject_email: ME })], demo: false });
    const body = await (await flagsGET()).json();
    expect(body.flags).toHaveLength(0);
  });

  it("refuses a flag filed on your own email", async () => {
    const res = await flagsPOST(
      post({ subject_email: ME.toUpperCase(), color: "green", description: "I am great." })
    );
    expect(res.status).toBe(403);
    expect(stub.submitFlag).not.toHaveBeenCalled();
  });

  it("refuses a flag filed on an applicant id that turns out to be you", async () => {
    ownApplicationIds.add("my-old-application");
    const res = await flagsPOST(
      post({ applicant_id: "my-old-application", color: "green", description: "I am great." })
    );
    expect(res.status).toBe(403);
    expect(stub.submitFlag).not.toHaveBeenCalled();
  });

  it("still lets you flag somebody else's application", async () => {
    ownApplicationIds.add("my-old-application");
    const res = await flagsPOST(post({ applicant_id: "a1", color: "red", description: "Late." }));
    expect(res.status).toBe(200);
    expect(stub.submitFlag).toHaveBeenCalled();
  });
});
