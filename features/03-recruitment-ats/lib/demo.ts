// Demo applicants + reviews, used until Supabase is configured so the console and
// analytics are explorable. Fictional people.
//
// The applicants deliberately spread across all three rounds (lib/rounds.ts) so
// each console has something in it without Supabase: `applied`/`screened` are the
// written round, `interview` is the first round, and `final_round` is the
// exec-only final. Reviews use the point rubric in types.ts.

import { screenTotal, type Applicant, type Flag, type Review, type Scores } from "./types";

export const DEMO_APPLICANTS: Applicant[] = [
  { id: "a1", created_at: "2026-09-02T15:00:00Z", name: "Jordan Ellis", email: "jellis@illinois.edu", year: "Sophomore", major: "Industrial Engineering", college: "Grainger", responses: { why: "I want client-facing problem-solving reps.", proud: "Led a 6-person FSAE subteam." }, cycle: "fa26", stage: "interview" },
  { id: "a2", created_at: "2026-09-02T16:30:00Z", name: "Priya Natarajan", email: "priyan@illinois.edu", year: "Junior", major: "Finance", college: "Gies", responses: { why: "Strategy work with real stakes.", proud: "Built a DCF model for a startup pitch." }, cycle: "fa26", stage: "offer" },
  { id: "a3", created_at: "2026-09-03T13:10:00Z", name: "Marcus Webb", email: "mwebb@illinois.edu", year: "Sophomore", major: "Computer Science", college: "Grainger", responses: { why: "Ship real software for clients.", proud: "Shipped a class-scheduling app used by 400 students." }, cycle: "fa26", stage: "screened" },
  { id: "a4", created_at: "2026-09-03T18:45:00Z", name: "Sofia Alvarez", email: "salvarez@illinois.edu", year: "Freshman", major: "Marketing", college: "Gies", responses: { why: "Brand + growth projects.", proud: "Grew a campus org's IG to 5k." }, cycle: "fa26", stage: "applied" },
  { id: "a5", created_at: "2026-09-04T14:20:00Z", name: "Daniel Okafor", email: "dokafor@illinois.edu", year: "Junior", major: "Mechanical Engineering", college: "Grainger", responses: { why: "Hardware prototyping for clients.", proud: "Designed a CAD fixture adopted by a lab." }, cycle: "fa26", stage: "interview" },
  { id: "a6", created_at: "2026-09-04T19:05:00Z", name: "Emily Chen", email: "echen@illinois.edu", year: "Sophomore", major: "Statistics", college: "LAS", responses: { why: "Data + analytics consulting.", proud: "Won a campus datathon." }, cycle: "fa26", stage: "accepted" },
  { id: "a7", created_at: "2026-09-05T12:00:00Z", name: "Liam Foster", email: "lfoster@illinois.edu", year: "Senior", major: "Economics", college: "LAS", responses: { why: "Market research and strategy.", proud: "Published an undergrad research paper." }, cycle: "fa26", stage: "rejected" },
  { id: "a8", created_at: "2026-09-05T17:40:00Z", name: "Ava Thompson", email: "athompson@illinois.edu", year: "Sophomore", major: "Design", college: "FAA", responses: { why: "UX work on client products.", proud: "Redesigned a nonprofit's site." }, cycle: "fa26", stage: "applied" },
  { id: "a9", created_at: "2026-09-05T20:15:00Z", name: "Nikhil Rao", email: "nrao@illinois.edu", year: "Junior", major: "Information Sciences", college: "iSchool", responses: { why: "Systems work with a client on the other end.", proud: "Ran the ops for a 300-person hackathon." }, cycle: "fa26", stage: "final_round" },
  // A PRIOR CYCLE, and the same person as a3 above. Marcus was turned down in
  // sp26 and applied again in fa26, which is the case the `cycle` column exists
  // for: two applications, one email, neither overwriting the other. It also
  // makes the cycle filter visible in demo mode — ask for fa26 and this row is
  // absent, ask for sp26 and it is the only one.
  { id: "a10", created_at: "2026-02-04T16:00:00Z", name: "Marcus Webb", email: "mwebb@illinois.edu", year: "Freshman", major: "Computer Science", college: "Grainger", responses: { why: "Want to see how consulting teams actually work.", proud: "Built a Discord bot my dorm floor still uses." }, cycle: "sp26", stage: "rejected" },
];

function review(applicant_id: string, reviewer: string, scores: Scores, notes: string, i: number): Review {
  return {
    id: `r-${applicant_id}-${i}`,
    created_at: "2026-09-06T00:00:00Z",
    applicant_id,
    reviewer_email: reviewer,
    scores,
    weighted_total: screenTotal(scores),
    notes,
    kind: "screen",
  };
}

/** Written-application scores, out of 28: essay_1 /5, essay_2 /3, essay_3 /3,
 *  case_essay /7, misc /5, resume /5. */
export const DEMO_REVIEWS: Review[] = [
  review("a1", "sujan@cubeconsulting.org", { essay_1: 4, essay_2: 2, essay_3: 3, case_essay: 5, misc: 4, resume: 4 }, "Strong leadership signal.", 1),
  review("a1", "isabella@cubeconsulting.org", { essay_1: 4, essay_2: 2, essay_3: 2, case_essay: 5, misc: 3, resume: 4 }, "A bit thin on the second essay but thoughtful.", 2),
  review("a2", "sujan@cubeconsulting.org", { essay_1: 5, essay_2: 3, essay_3: 3, case_essay: 7, misc: 5, resume: 5 }, "Top of the pool.", 1),
  review("a2", "neha@cubeconsulting.org", { essay_1: 5, essay_2: 3, essay_3: 2, case_essay: 6, misc: 4, resume: 5 }, "Sharp modeling work on the case.", 2),
  review("a3", "neha@cubeconsulting.org", { essay_1: 3, essay_2: 2, essay_3: 2, case_essay: 5, misc: 3, resume: 4 }, "Solid technically.", 1),
  // a3 has only one review so far → coverage should flag "needs a 2nd reviewer".
  review("a5", "sujan@cubeconsulting.org", { essay_1: 2, essay_2: 1, essay_3: 2, case_essay: 3, misc: 2, resume: 3 }, "Case essay never lands an answer.", 1),
  review("a5", "isabella@cubeconsulting.org", { essay_1: 4, essay_2: 3, essay_3: 3, case_essay: 6, misc: 4, resume: 4 }, "Stronger than the essays read at first.", 2),
  // a5 spreads 13 vs 24 → past DISAGREEMENT_THRESHOLD, so exec reads the notes.
  review("a6", "neha@cubeconsulting.org", { essay_1: 5, essay_2: 3, essay_3: 3, case_essay: 6, misc: 4, resume: 5 }, "Clear accept.", 1),
  review("a6", "sujan@cubeconsulting.org", { essay_1: 4, essay_2: 3, essay_3: 3, case_essay: 6, misc: 5, resume: 5 }, "Great energy.", 2),
  review("a7", "isabella@cubeconsulting.org", { essay_1: 2, essay_2: 1, essay_3: 1, case_essay: 2, misc: 2, resume: 3 }, "Not a fit this cycle.", 1),
  review("a7", "neha@cubeconsulting.org", { essay_1: 2, essay_2: 1, essay_3: 0, case_essay: 2, misc: 1, resume: 3 }, "Agree, pass — third essay left blank.", 2),
  review("a9", "sujan@cubeconsulting.org", { essay_1: 4, essay_2: 3, essay_3: 3, case_essay: 6, misc: 4, resume: 5 }, "Carried the case essay.", 1),
  review("a9", "isabella@cubeconsulting.org", { essay_1: 4, essay_2: 2, essay_3: 3, case_essay: 6, misc: 4, resume: 4 }, "Agreed — through to interviews.", 2),
];

// Two kinds of flag, both real: ones already sitting on an applicant's profile,
// and PENDING ones filed at an event against an email nobody has applied from
// yet. The last linked flag below was itself filed pre-application (note the
// `event` and the created_at a week before the cycle opened) — that is the case
// the pending pool exists to produce.
export const DEMO_FLAGS: Flag[] = [
  { id: "f-a1-1", created_at: "2026-09-06T01:00:00Z", applicant_id: "a1", subject_email: "jellis@illinois.edu", submitter_email: "sujan@cubeconsulting.org", color: "green", description: "Followed up personally with every teammate after the info session.", linked_at: "2026-09-06T01:00:00Z" },
  { id: "f-a3-1", created_at: "2026-09-06T02:00:00Z", applicant_id: "a3", subject_email: "mwebb@illinois.edu", submitter_email: "neha@cubeconsulting.org", color: "red", description: "Showed up 20 minutes late to the coffee chat with no heads-up.", linked_at: "2026-09-06T02:00:00Z" },
  { id: "f-a2-1", created_at: "2026-08-26T23:15:00Z", applicant_id: "a2", subject_email: "priyan@illinois.edu", subject_name: "Priya Natarajan", event: "Fall Info Night", submitter_email: "isabella@cubeconsulting.org", color: "green", description: "Asked the sharpest question of the night and stayed to help stack chairs.", linked_at: "2026-09-02T16:30:00Z" },
];

// Filed at events against people who have not applied (yet). These attach
// automatically if an application ever arrives from the same address.
export const DEMO_PENDING_FLAGS: Flag[] = [
  { id: "f-p-1", created_at: "2026-08-25T02:30:00Z", applicant_id: null, subject_email: "rkapoor@illinois.edu", subject_name: "Rohan Kapoor", event: "Fall Info Night", submitter_email: "sujan@cubeconsulting.org", color: "green", description: "Ran the whole room through a case he'd prepped himself. Recruit him." },
  { id: "f-p-2", created_at: "2026-08-28T20:00:00Z", applicant_id: null, subject_email: "tnguyen@illinois.edu", subject_name: "Thao Nguyen", event: "Coffee chats", submitter_email: "neha@cubeconsulting.org", color: "red", description: "Booked three coffee chats and no-showed all three without a message." },
];
