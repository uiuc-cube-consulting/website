/**
 * Cycle scoping through the store, on the demo path.
 *
 * `getSnapshot` is what every recruiting surface reads, so "which cohort am I
 * looking at" is decided here or nowhere. These run against DEMO_APPLICANTS
 * with no Supabase configured, which exercises the real filtering code — the
 * demo branch and the database branch narrow by the same rules.
 *
 * The fixture matters: demo data holds nine fa26 applications plus one sp26
 * (`a10`), and a10 is the SAME PERSON as a3 — Marcus Webb, turned down in sp26
 * and back in fa26. That is the case the cycle column exists for.
 */

import { getSnapshot } from "@/features/03-recruitment-ats/lib/store";
import { DEMO_APPLICANTS } from "@/features/03-recruitment-ats/lib/demo";
import { cyclesPresent } from "@/features/03-recruitment-ats/lib/cycle";

describe("getSnapshot cycle scoping", () => {
  it("returns every cycle when none is asked for", async () => {
    const snap = await getSnapshot();
    expect(snap.demo).toBe(true);
    expect(snap.applicants).toHaveLength(DEMO_APPLICANTS.length);
    expect(cyclesPresent(snap.applicants)).toEqual(["fa26", "sp26"]);
  });

  it("narrows to one cohort", async () => {
    const fa26 = await getSnapshot("fa26");
    expect(fa26.applicants.every((a) => a.cycle === "fa26")).toBe(true);
    expect(fa26.applicants.map((a) => a.id)).not.toContain("a10");

    const sp26 = await getSnapshot("sp26");
    expect(sp26.applicants.map((a) => a.id)).toEqual(["a10"]);
  });

  it("accepts any spelling of the cycle", async () => {
    const a = await getSnapshot("Fall 2026");
    const b = await getSnapshot("fa26");
    expect(a.applicants.map((x) => x.id)).toEqual(b.applicants.map((x) => x.id));
  });

  it("keeps one person's two applications apart", async () => {
    // Marcus Webb holds a3 (fa26) and a10 (sp26) on one email. Each cohort sees
    // exactly one of them, and the two carry different stages — which is the
    // whole point: the sp26 rejection does not follow him into fa26.
    const email = "mwebb@illinois.edu";
    const fa26 = (await getSnapshot("fa26")).applicants.filter((a) => a.email === email);
    const sp26 = (await getSnapshot("sp26")).applicants.filter((a) => a.email === email);

    expect(fa26).toHaveLength(1);
    expect(sp26).toHaveLength(1);
    expect(fa26[0].id).not.toBe(sp26[0].id);
    expect(sp26[0].stage).toBe("rejected");
    expect(fa26[0].stage).toBe("screened");
  });

  it("scopes reviews to the cohort's own applications", async () => {
    // A mean computed over two cycles of the same person is not a number that
    // describes anything, so reviews are narrowed with the applicants.
    const fa26 = await getSnapshot("fa26");
    const ids = new Set(fa26.applicants.map((a) => a.id));
    expect(fa26.reviews.every((r) => ids.has(r.applicant_id))).toBe(true);
    expect(fa26.reviews.length).toBeGreaterThan(0);
  });

  it("scopes attached flags to the cohort", async () => {
    const fa26 = await getSnapshot("fa26");
    const ids = new Set(fa26.applicants.map((a) => a.id));
    expect(fa26.flags.every((f) => f.applicant_id && ids.has(f.applicant_id))).toBe(true);
  });

  it("does NOT scope pending flags to a cycle", async () => {
    // A pending flag is filed against an email before any application exists, so
    // it belongs to no cohort until one claims it. Hiding pending flags behind a
    // cycle filter would empty the between-cycles surface they exist to serve.
    const all = await getSnapshot();
    const fa26 = await getSnapshot("fa26");
    const sp26 = await getSnapshot("sp26");
    expect(fa26.pendingFlags).toEqual(all.pendingFlags);
    expect(sp26.pendingFlags).toEqual(all.pendingFlags);
    expect(all.pendingFlags.length).toBeGreaterThan(0);
  });

  it("returns an empty cohort for a cycle nobody applied in", async () => {
    const snap = await getSnapshot("sp30");
    expect(snap.applicants).toEqual([]);
    expect(snap.reviews).toEqual([]);
    expect(snap.flags).toEqual([]);
  });
});

describe("the funnel is per-cycle", () => {
  it("counts each cohort separately rather than summing them", async () => {
    const all = await getSnapshot();
    const fa26 = await getSnapshot("fa26");
    const sp26 = await getSnapshot("sp26");
    expect(fa26.applicants.length + sp26.applicants.length).toBe(all.applicants.length);
    // And neither cohort is the whole set — the scoping is doing something.
    expect(fa26.applicants.length).toBeLessThan(all.applicants.length);
    expect(sp26.applicants.length).toBeLessThan(all.applicants.length);
  });
});
