// Demo applicants + reviews, used until Supabase is configured so the console and
// analytics are explorable. Fictional people. Reviews use the rubric in types.ts.

import { weightedTotal, type Applicant, type Review, type Scores } from "./types";

export const DEMO_APPLICANTS: Applicant[] = [
  { id: "a1", created_at: "2026-09-02T15:00:00Z", name: "Jordan Ellis", email: "jellis@illinois.edu", year: "Sophomore", major: "Industrial Engineering", college: "Grainger", responses: { why: "I want client-facing problem-solving reps.", proud: "Led a 6-person FSAE subteam." }, stage: "interview" },
  { id: "a2", created_at: "2026-09-02T16:30:00Z", name: "Priya Natarajan", email: "priyan@illinois.edu", year: "Junior", major: "Finance", college: "Gies", responses: { why: "Strategy work with real stakes.", proud: "Built a DCF model for a startup pitch." }, stage: "offer" },
  { id: "a3", created_at: "2026-09-03T13:10:00Z", name: "Marcus Webb", email: "mwebb@illinois.edu", year: "Sophomore", major: "Computer Science", college: "Grainger", responses: { why: "Ship real software for clients.", proud: "Shipped a class-scheduling app used by 400 students." }, stage: "screened" },
  { id: "a4", created_at: "2026-09-03T18:45:00Z", name: "Sofia Alvarez", email: "salvarez@illinois.edu", year: "Freshman", major: "Marketing", college: "Gies", responses: { why: "Brand + growth projects.", proud: "Grew a campus org's IG to 5k." }, stage: "applied" },
  { id: "a5", created_at: "2026-09-04T14:20:00Z", name: "Daniel Okafor", email: "dokafor@illinois.edu", year: "Junior", major: "Mechanical Engineering", college: "Grainger", responses: { why: "Hardware prototyping for clients.", proud: "Designed a CAD fixture adopted by a lab." }, stage: "interview" },
  { id: "a6", created_at: "2026-09-04T19:05:00Z", name: "Emily Chen", email: "echen@illinois.edu", year: "Sophomore", major: "Statistics", college: "LAS", responses: { why: "Data + analytics consulting.", proud: "Won a campus datathon." }, stage: "accepted" },
  { id: "a7", created_at: "2026-09-05T12:00:00Z", name: "Liam Foster", email: "lfoster@illinois.edu", year: "Senior", major: "Economics", college: "LAS", responses: { why: "Market research and strategy.", proud: "Published an undergrad research paper." }, stage: "rejected" },
  { id: "a8", created_at: "2026-09-05T17:40:00Z", name: "Ava Thompson", email: "athompson@illinois.edu", year: "Sophomore", major: "Design", college: "FAA", responses: { why: "UX work on client products.", proud: "Redesigned a nonprofit's site." }, stage: "applied" },
];

function review(applicant_id: string, reviewer: string, scores: Scores, notes: string, i: number): Review {
  return {
    id: `r-${applicant_id}-${i}`,
    created_at: "2026-09-06T00:00:00Z",
    applicant_id,
    reviewer_email: reviewer,
    scores,
    weighted_total: weightedTotal(scores),
    notes,
  };
}

export const DEMO_REVIEWS: Review[] = [
  review("a1", "sujan@cubeconsulting.org", { problem_solving: 4, communication: 4, drive: 5, fit: 4 }, "Strong leadership signal.", 1),
  review("a1", "isabella@cubeconsulting.org", { problem_solving: 4, communication: 3, drive: 5, fit: 4 }, "A bit quiet but thoughtful.", 2),
  review("a2", "sujan@cubeconsulting.org", { problem_solving: 5, communication: 5, drive: 4, fit: 5 }, "Top of the pool.", 1),
  review("a2", "neha@cubeconsulting.org", { problem_solving: 5, communication: 4, drive: 4, fit: 5 }, "Sharp modeling skills.", 2),
  review("a3", "neha@cubeconsulting.org", { problem_solving: 4, communication: 3, drive: 4, fit: 3 }, "Solid technically.", 1),
  // a3 has only one review so far → calibration should flag "needs 2nd reviewer".
  review("a5", "sujan@cubeconsulting.org", { problem_solving: 3, communication: 4, drive: 4, fit: 4 }, "Good hardware fit.", 1),
  review("a5", "isabella@cubeconsulting.org", { problem_solving: 5, communication: 4, drive: 4, fit: 4 }, "Stronger than scores show.", 2),
  // a5 has a wide spread on problem_solving (3 vs 5) → calibration signal.
  review("a6", "neha@cubeconsulting.org", { problem_solving: 5, communication: 4, drive: 5, fit: 5 }, "Clear accept.", 1),
  review("a6", "sujan@cubeconsulting.org", { problem_solving: 4, communication: 5, drive: 5, fit: 5 }, "Great energy.", 2),
  review("a7", "isabella@cubeconsulting.org", { problem_solving: 2, communication: 3, drive: 2, fit: 3 }, "Not a fit this cycle.", 1),
  review("a7", "neha@cubeconsulting.org", { problem_solving: 3, communication: 2, drive: 2, fit: 2 }, "Agree, pass.", 2),
];
