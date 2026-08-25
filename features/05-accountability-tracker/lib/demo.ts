// Demo fallback so /portal/accountability is explorable before Supabase is
// configured (same convention as the ATS). Writes are refused in demo mode —
// the UI says so rather than pretending to save.
//
// Deliberately fictional people on a fictional project: demo rows carry invented
// Below ratings and notes, and those must never appear next to a real member's name.

import type { Project, ProjectMember, RatingRow } from "./types";

export const DEMO_PROJECT: Project = {
  id: "demo-project",
  name: "Sample Project",
  client: "Sample Client",
  cohort: "FA26",
  starts_on: "2026-08-24",
  weeks: 12,
  active: true,
};

export const DEMO_MEMBERS: ProjectMember[] = [
  { member_id: "d-pm", full_name: "Dana Reyes", email: "dreyes@example.edu", seat: "project_manager" },
  { member_id: "d-sc", full_name: "Sam Okafor", email: "sokafor@example.edu", seat: "senior_consultant" },
  { member_id: "d-1", full_name: "Alex Kim", email: "akim@example.edu", seat: "consultant" },
  { member_id: "d-2", full_name: "Jordan Ellis", email: "jellis@example.edu", seat: "consultant" },
  { member_id: "d-3", full_name: "Priya Menon", email: "pmenon@example.edu", seat: "consultant" },
  { member_id: "d-4", full_name: "Noah Bright", email: "nbright@example.edu", seat: "consultant" },
];

const CONSULTANTS = DEMO_MEMBERS.filter((m) => m.seat === "consultant");

// Weeks 1–2 fully rated, week 3 left half-done so the "needs attention" and
// completion states are both visible without touching a database.
export const DEMO_RATINGS: RatingRow[] = [
  ...[1, 2].flatMap((week) =>
    CONSULTANTS.flatMap((m) =>
      (["work_quality", "behavior", "initiative"] as const).map((category) => ({
        member_id: m.member_id,
        week,
        category,
        rating: "meets" as const,
        note: null,
        rated_by: "d-pm",
        rated_by_name: "Dana Reyes",
      }))
    )
  ),
  {
    member_id: "d-3",
    week: 2,
    category: "work_quality",
    rating: "exceeds",
    note: "Rebuilt the sizing model the night before the midpoint. Client called it out.",
    rated_by: "d-pm",
    rated_by_name: "Dana Reyes",
  },
  {
    member_id: "d-2",
    week: 3,
    category: "behavior",
    rating: "below",
    note: "Missed two standups without a heads-up.",
    rated_by: "d-sc",
    rated_by_name: "Sam Okafor",
  },
  {
    member_id: "d-1",
    week: 3,
    category: "work_quality",
    rating: "meets",
    note: null,
    rated_by: "d-pm",
    rated_by_name: "Dana Reyes",
  },
];
