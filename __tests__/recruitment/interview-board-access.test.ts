/**
 * The interview board hides the viewer's own candidacy.
 *
 * Separate from self-access-routes.test.ts because this exercises the REAL
 * `getBoard` against demo data, and that suite mocks interview-store in order to
 * test the routes above it. The redaction lives inside `getBoard` rather than in
 * `interview/route.ts`, so that the resume pointer, the panel and the completion
 * counts all disappear together — testing it here tests the thing itself.
 *
 * Demo fixture: `a1` Jordan Ellis and `a5` Daniel Okafor are both at the
 * `interview` stage, so signing in as one of them is a member who is live in the
 * round they are also staffing.
 */

import { getBoard } from "@/features/03-recruitment-ats/lib/interview-store";

const JORDAN = "jellis@illinois.edu";

describe("getBoard", () => {
  it("omits the viewer's own candidacy", async () => {
    const board = await getBoard(JORDAN, false, "first_round");
    const emails = board.candidates.map((c) => c.email);
    expect(emails).not.toContain(JORDAN);
    expect(emails.length).toBeGreaterThan(0); // the round is not simply empty
  });

  it("matches the viewer's email case-insensitively", async () => {
    const board = await getBoard("JEllis@Illinois.EDU", false, "first_round");
    expect(board.candidates.map((c) => c.email)).not.toContain(JORDAN);
  });

  it("has no exec bypass", async () => {
    // `canManage` is the exec flag. It controls what exec may DO to the board,
    // never whether exec may read their own row.
    const board = await getBoard(JORDAN, true, "first_round");
    expect(board.candidates.map((c) => c.email)).not.toContain(JORDAN);
  });

  it("leaves the board intact for someone who never applied", async () => {
    const mine = await getBoard(JORDAN, false, "first_round");
    const theirs = await getBoard("newcomer@illinois.edu", false, "first_round");
    expect(theirs.candidates.length).toBe(mine.candidates.length + 1);
  });

  it("takes the resume, panel and rubric state with the row", async () => {
    // The point of redacting inside getBoard rather than in the route: a hidden
    // candidate leaves nothing behind for the console to render.
    //
    // Asserted over `candidates` rather than the whole payload, because
    // `board.viewer` legitimately carries the viewer's own address — that is who
    // they are, not information about their candidacy.
    const board = await getBoard(JORDAN, true, "first_round");
    expect(JSON.stringify(board.candidates)).not.toContain(JORDAN);
    expect(board.viewer).toBe(JORDAN);
  });
});
