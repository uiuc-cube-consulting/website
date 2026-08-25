// Shared vocabulary for the accountability tracker. Kept free of I/O so the
// route handlers, the grid UI and the tests all read the same definitions.

export const RATINGS = ["below", "meets", "exceeds"] as const;
export type Rating = (typeof RATINGS)[number];

export const CATEGORIES = [
  {
    key: "work_quality",
    label: "Work Quality",
    short: "Work",
    blurb: "Deliverables, analysis, and how much rework the PM has to do.",
  },
  {
    key: "behavior",
    label: "Behavior & Professionalism",
    short: "Behavior",
    blurb: "Shows up, on time, prepared, communicates when plans change.",
  },
  {
    key: "initiative",
    label: "Initiative & Ownership",
    short: "Initiative",
    blurb: "Picks work up without being asked and carries it to done.",
  },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as readonly CategoryKey[];

export const RATING_LABEL: Record<Rating, string> = {
  below: "Below",
  meets: "Meets",
  exceeds: "Exceeds",
};

export type Seat = "project_manager" | "senior_consultant" | "consultant";

export const SEAT_LABEL: Record<Seat, string> = {
  project_manager: "Project Manager",
  senior_consultant: "Senior Consultant",
  consultant: "Consultant",
};

export type Project = {
  id: string;
  name: string;
  client: string | null;
  cohort: string;
  starts_on: string; // ISO date, the Monday of Week 1
  weeks: number;
  active: boolean;
};

export type ProjectMember = {
  member_id: string;
  full_name: string;
  email: string;
  seat: Seat;
};

export type RatingRow = {
  member_id: string;
  week: number;
  category: CategoryKey;
  rating: Rating;
  note: string | null;
  rated_by: string | null;
  rated_by_name?: string | null;
  updated_at?: string;
};

/** One cell the grid submits. `note` of "" clears the note. */
export type RatingInput = {
  member_id: string;
  category: CategoryKey;
  rating: Rating;
  note?: string | null;
};

export function isRating(v: unknown): v is Rating {
  return typeof v === "string" && (RATINGS as readonly string[]).includes(v);
}

export function isCategory(v: unknown): v is CategoryKey {
  return typeof v === "string" && (CATEGORY_KEYS as readonly string[]).includes(v);
}

/**
 * Completion for one week of one project: every consultant needs a rating in
 * every category. This is what the reminder job and the exec board both read,
 * so "done" means the same thing in the email and on the screen.
 */
export function weekCompletion(
  consultants: Pick<ProjectMember, "member_id">[],
  rows: Pick<RatingRow, "member_id" | "category" | "week">[],
  week: number
): { filled: number; total: number; complete: boolean } {
  const ids = new Set(consultants.map((c) => c.member_id));
  const seen = new Set<string>();

  for (const r of rows) {
    if (r.week !== week) continue;
    if (!ids.has(r.member_id)) continue; // ignore someone who left the project
    seen.add(`${r.member_id}:${r.category}`);
  }

  const total = ids.size * CATEGORY_KEYS.length;
  return { filled: seen.size, total, complete: total > 0 && seen.size >= total };
}
