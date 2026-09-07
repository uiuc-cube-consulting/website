/**
 * Which round a candidate actually reached.
 *
 * `applicants.stage` holds one value — the current one — so the moment exec
 * rejects someone after their interview, the fact that they were interviewed
 * disappears from that column. Every question worth asking after a cycle ends
 * ("who did the first round turn down", "who did we interview, split by major")
 * therefore cannot be answered from the stage alone, and there is no
 * stage-history table to consult.
 *
 * These pin the inference that stands in for one, and above all the two ways it
 * must not fail: a candidate rejected after an interview must never be counted
 * with the written rejections, and a candidate who never got an interview must
 * never be counted with the people who did.
 */

import {
  cohortOf,
  deepestRound,
  entryStageIsCovered,
  gatherEvidence,
  reachedRound,
  rejectedAfter,
} from "@/features/03-recruitment-ats/lib/cohort";
import { INTERVIEW_ROUNDS } from "@/features/03-recruitment-ats/lib/rounds";
import type { Applicant, Review, Stage } from "@/features/03-recruitment-ats/lib/types";

function applicant(id: string, stage: Stage): Applicant {
  return {
    id,
    name: `Person ${id}`,
    email: `${id}@illinois.edu`,
    stage,
    cycle: "fa26",
    created_at: "2026-08-01T00:00:00.000Z",
  } as Applicant;
}

function review(applicant_id: string, kind: string): Pick<Review, "applicant_id" | "kind"> {
  return { applicant_id, kind } as Pick<Review, "applicant_id" | "kind">;
}

// The live fa26 shape, in miniature:
//   w  — cut on the written application, never interviewed
//   f  — interviewed in the first round, then cut
//   a  — interviewed and advanced; sitting in the final round
//   n  — rostered for a first-round interview, no-showed, then cut
const w = applicant("w", "rejected");
const f = applicant("f", "rejected");
const a = applicant("a", "final_round");
const n = applicant("n", "rejected");
const pool = [w, f, a, n];

const reviews = [
  review("w", "screen"),
  review("f", "screen"),
  review("f", "case"),
  review("f", "behavioral"),
  review("a", "screen"),
  review("a", "case"),
  review("a", "behavioral"),
  review("n", "screen"),
];
const panels = [{ applicant_id: "n", round: "first_round" }];
const evidence = gatherEvidence(reviews, panels);

describe("reachedRound", () => {
  it("counts a candidate who was scored in the round, whatever became of them", () => {
    // The case this exists for: `f` is at `rejected` and nothing in that stage
    // says they ever sat an interview.
    expect(reachedRound(f, "first_round", evidence)).toBe(true);
  });

  it("counts a candidate whose stage is past the round", () => {
    // `a` is in the final round now, so they cleared the first — even though the
    // first round's own stage is long behind them.
    expect(reachedRound(a, "first_round", evidence)).toBe(true);
    expect(reachedRound(a, "final_round", evidence)).toBe(true);
  });

  it("counts a candidate who was rostered but never scored", () => {
    // The no-show, or the interviewer who never wrote the number down. Reviews
    // alone would file them with people who never got an interview at all.
    expect(reachedRound(n, "first_round", evidence)).toBe(true);
  });

  it("does not count a candidate cut on their written application", () => {
    expect(reachedRound(w, "first_round", evidence)).toBe(false);
    expect(reachedRound(w, "final_round", evidence)).toBe(false);
  });

  it("keeps the rounds independent — a first-round score is not a final-round one", () => {
    expect(reachedRound(f, "final_round", evidence)).toBe(false);
  });
});

describe("deepestRound", () => {
  it("reports how far each person got", () => {
    expect(deepestRound(w, evidence)).toBe("written");
    expect(deepestRound(f, evidence)).toBe("first_round");
    expect(deepestRound(n, evidence)).toBe("first_round");
    expect(deepestRound(a, evidence)).toBe("final_round");
  });

  it("never returns null — applying is reaching the written round", () => {
    expect(deepestRound(applicant("x", "rejected"), gatherEvidence([]))).toBe("written");
  });
});

describe("cohortOf", () => {
  it("is the whole pool for the written round", () => {
    expect(cohortOf("written", pool, evidence).map((x) => x.id)).toEqual(["w", "f", "a", "n"]);
  });

  it("keeps the people a round turned down", () => {
    // The failure this guards: scoping by stage would return only `a`, and the
    // report would say the first round interviewed one person.
    expect(cohortOf("first_round", pool, evidence).map((x) => x.id)).toEqual(["f", "a", "n"]);
  });

  it("narrows to the people who actually got there", () => {
    expect(cohortOf("final_round", pool, evidence).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("rejectedAfter", () => {
  it("separates an interview rejection from a written one", () => {
    // Two different letters. Mixing them is the mistake this whole module is
    // built to prevent.
    expect(rejectedAfter("first_round", pool, evidence).map((x) => x.id)).toEqual(["f", "n"]);
    expect(rejectedAfter("written", pool, evidence).map((x) => x.id)).toEqual(["w"]);
  });

  it("does not report a withdrawal as a rejection", () => {
    // Their decision, not ours, and they get no letter.
    const quit = applicant("q", "withdrawn");
    const ev = gatherEvidence([...reviews, review("q", "case")]);
    expect(rejectedAfter("first_round", [...pool, quit], ev).map((x) => x.id)).not.toContain("q");
  });

  it("does not report someone still live in the process", () => {
    expect(rejectedAfter("final_round", pool, evidence)).toEqual([]);
  });
});

describe("panel evidence", () => {
  it("treats a panel row with no round as first-round, matching the migration default", () => {
    const ev = gatherEvidence([], [{ applicant_id: "z", round: null }]);
    expect(reachedRound(applicant("z", "rejected"), "first_round", ev)).toBe(true);
  });

  it("works without panels at all, since most callers have none", () => {
    const ev = gatherEvidence(reviews);
    expect(reachedRound(f, "first_round", ev)).toBe(true);
    // `n` is the one this costs: rostered, never scored, and now indistinguishable
    // from a written rejection. Documented as the limit of the inference.
    expect(reachedRound(n, "first_round", ev)).toBe(false);
  });
});

describe("the two stage lists agree", () => {
  it("treats each round's own entry stage as being in that round", () => {
    // ROUND_STAGES and the at-or-past list are maintained separately; a stage
    // added to one and not the other would silently drop a live candidate out
    // of their own round's cohort.
    for (const round of INTERVIEW_ROUNDS) {
      expect(entryStageIsCovered(round)).toBe(true);
    }
  });
});
