import { normalizeLinkedIn } from "@/features/07-alumni-directory/lib/alumni";

export const INTERESTS = [
  "Strategy", "Technology", "Data & analytics", "Marketing", "Finance",
  "Operations", "Healthcare", "Sustainability", "Social impact", "Product",
] as const;

export type Profile = {
  bio: string;
  major: string;
  graduation_year: number | null;
  website: string;
  linkedin: string;
  interests: string[];
  skills: string[];
  learning_goals: string;
  directory_visible: boolean;
  open_to_mentor: boolean;
  share_email: boolean;
};
export const EMPTY_PROFILE: Profile = {
  bio: "", major: "", graduation_year: null, website: "", linkedin: "",
  interests: [], skills: [], learning_goals: "",
  directory_visible: false, open_to_mentor: false, share_email: false,
};
export type Member = { id: string; full_name: string | null; email: string; role: string; cohort: string | null };
export type Cycle = { id: string; name: string; status: "draft" | "open" | "closed"; deadline: string | null; created_at: string };
export type Project = { id: string; cycle_id: string; title: string; client: string; summary: string; tags: string[]; capacity: number };
export type PreferenceInput = { cycle_id: string; ranked_project_ids: string[]; notes: string; hours_per_week: number };
export type Preference = PreferenceInput & { member_id: string; updated_at: string };
export type MatchingData = {
  member: Member;
  profile: Profile;
  cycles: Cycle[];
  projects: Project[];
  preferences: Preference[];
  // Only exec responses carry the roster and other members' private profiles.
  members?: Member[];
  profiles?: (Profile & { member_id: string })[];
};

export class InputError extends Error {}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Expected an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max) throw new InputError(`${label} must be text of at most ${max} characters.`);
  const result = value.trim();
  if (required && !result) throw new InputError(`${label} is required.`);
  return result;
}
function list(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new InputError(`Choose at most ${max} ${label}.`);
  const items = value.map((v) => text(v, label, 60, true));
  if (new Set(items.map((v) => v.toLowerCase())).size !== items.length) throw new InputError(`Remove duplicate ${label}.`);
  return items;
}
function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new InputError(`${label} must be between ${min} and ${max}.`);
  return value;
}
export function id(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new InputError("Invalid identifier.");
  return value;
}
function url(value: unknown, label: string): string {
  const raw = text(value, label, 300);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch { throw new InputError(`${label} must be an http or https URL without credentials.`); }
}
export function parseProfile(value: unknown): Profile {
  const v = object(value);
  const interests = list(v.interests, "interests", 10);
  if (interests.some((s) => !(INTERESTS as readonly string[]).includes(s))) throw new InputError("Choose interests from the list.");
  for (const key of ["directory_visible", "open_to_mentor", "share_email"]) {
    if (v[key] !== undefined && typeof v[key] !== "boolean") throw new InputError("Directory sharing choices must be true or false.");
  }
  if (!v.directory_visible && (v.open_to_mentor || v.share_email)) throw new InputError("Enable directory profile sharing before sharing contact details or mentoring availability.");
  const linkedin = url(v.linkedin, "LinkedIn");
  const canonicalLinkedIn = normalizeLinkedIn(linkedin);
  if (linkedin && !canonicalLinkedIn) throw new InputError("LinkedIn must be a linkedin.com/in/ profile URL.");
  return {
    bio: text(v.bio, "Bio", 800),
    major: text(v.major, "Major", 120),
    graduation_year: v.graduation_year === null ? null : integer(v.graduation_year, "Graduation year", 2000, 2100),
    website: url(v.website, "Website"), linkedin: canonicalLinkedIn ?? "",
    interests, skills: list(v.skills, "skills", 15),
    learning_goals: text(v.learning_goals, "Learning goals", 1000),
    directory_visible: v.directory_visible === true, open_to_mentor: v.open_to_mentor === true, share_email: v.share_email === true,
  };
}
export function parsePreference(value: unknown): PreferenceInput {
  const v = object(value);
  if (!Array.isArray(v.ranked_project_ids) || v.ranked_project_ids.length < 1 || v.ranked_project_ids.length > 3) throw new InputError("Rank one to three projects.");
  const ranked = v.ranked_project_ids.map(id);
  if (new Set(ranked).size !== ranked.length) throw new InputError("Each project can only be ranked once.");
  return { cycle_id: id(v.cycle_id), ranked_project_ids: ranked, notes: text(v.notes, "Preference notes", 1000), hours_per_week: integer(v.hours_per_week, "Hours per week", 1, 40) };
}
export type AdminAction =
  | { action: "create_cycle"; name: string; deadline: string | null }
  | { action: "add_project"; cycle_id: string; title: string; client: string; summary: string; tags: string[]; capacity: number }
  | { action: "publish" | "close"; cycle_id: string };
export function parseAdminAction(value: unknown): AdminAction {
  const v = object(value);
  if (v.action === "create_cycle") {
    let deadline: string | null = null;
    if (v.deadline !== null && v.deadline !== "") {
      if (typeof v.deadline !== "string" || !Number.isFinite(Date.parse(v.deadline)) || Date.parse(v.deadline) <= Date.now()) throw new InputError("The deadline must be in the future.");
      deadline = new Date(v.deadline).toISOString();
    }
    return { action: v.action, name: text(v.name, "Semester name", 80, true), deadline };
  }
  if (v.action === "publish" || v.action === "close") return { action: v.action, cycle_id: id(v.cycle_id) };
  if (v.action === "add_project") {
    const tags = list(v.tags, "project interests", 10);
    if (tags.some((s) => !(INTERESTS as readonly string[]).includes(s))) throw new InputError("Choose project interests from the list.");
    return { action: v.action, cycle_id: id(v.cycle_id), title: text(v.title, "Title", 120, true), client: text(v.client, "Client", 120), summary: text(v.summary, "Project brief", 2000, true), tags, capacity: integer(v.capacity, "Team size", 1, 30) };
  }
  throw new InputError("Unknown matching action.");
}
export function accepting(cycle: Cycle, now = Date.now()): boolean {
  return cycle.status === "open" && (!cycle.deadline || Date.parse(cycle.deadline) > now);
}
export function sharedInterests(profile: Profile, project: Project): string[] {
  return project.tags.filter((tag) => profile.interests.includes(tag));
}
export function profileCompletion(profile: Profile): number {
  const fields = [profile.bio, profile.major, profile.graduation_year, profile.interests.length, profile.skills.length, profile.learning_goals];
  return Math.round(fields.filter(Boolean).length / fields.length * 100);
}
