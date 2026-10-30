import { createServerClient } from "@/lib/supabase/server";
import { EMPTY_PROFILE, type Member, type MatchingData, type Profile, type Cycle, type Project, type Preference, type PreferenceInput, type AdminAction } from "./model";

export class StoreError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export function database() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new StoreError("Member profiles and matching are not configured yet.");
  }
  return createServerClient();
}
type DBError = { code?: string } | null;
function check(error: DBError) {
  if (!error) return;
  if (["PGRST205", "PGRST202", "42P01", "42883"].includes(error.code ?? "")) throw new StoreError("Run features/08-member-matching/db/schema.sql to enable profiles and matching.");
  // Do not send raw database messages, row contents, or credentials to clients.
  if (error.code === "23505") throw new StoreError("That semester or project already exists, or another semester is still open.", 409);
  if (error.code === "P0001") throw new StoreError("This semester cannot accept that change. Refresh to check its status and projects.", 409);
  throw new StoreError("Could not save or load matching data. Please try again.");
}
const PROFILE_COLUMNS = "member_id,bio,major,graduation_year,website,linkedin,interests,skills,learning_goals,directory_visible,open_to_mentor,share_email";
const MEMBER_COLUMNS = "id,full_name,email,role,cohort";

/** Re-check the live roster, not a potentially stale JWT role. */
export async function currentMember(memberId: string): Promise<Member | null> {
  const { data, error } = await database().from("members").select(MEMBER_COLUMNS).eq("id", memberId).maybeSingle();
  check(error);
  return data as Member | null;
}
export async function loadMatching(member: Member): Promise<MatchingData> {
  const db = database();
  const exec = member.role === "exec";
  let cycleQuery = db.from("matching_cycles").select("id,name,status,deadline,created_at").order("created_at", { ascending: false });
  if (!exec) cycleQuery = cycleQuery.neq("status", "draft");
  const cyclesResult = await cycleQuery;
  check(cyclesResult.error);
  const cycles = (cyclesResult.data ?? []) as Cycle[];
  const ids = cycles.map((c) => c.id);
  const [own, projects, preferences] = await Promise.all([
    db.from("member_profiles").select(PROFILE_COLUMNS).eq("member_id", member.id).maybeSingle(),
    ids.length ? db.from("matching_projects").select("id,cycle_id,title,client,summary,tags,capacity").in("cycle_id", ids).order("title") : Promise.resolve({ data: [], error: null }),
    ids.length ? (exec
      ? db.from("matching_preferences").select("*").in("cycle_id", ids)
      : db.from("matching_preferences").select("*").in("cycle_id", ids).eq("member_id", member.id)) : Promise.resolve({ data: [], error: null }),
  ]);
  [own.error, projects.error, preferences.error].forEach(check);
  const result: MatchingData = {
    member, profile: own.data ? { ...EMPTY_PROFILE, ...own.data } as Profile : { ...EMPTY_PROFILE },
    cycles, projects: (projects.data ?? []) as Project[], preferences: (preferences.data ?? []) as Preference[],
  };
  if (exec) {
    const [members, profiles] = await Promise.all([
      db.from("members").select(MEMBER_COLUMNS).order("full_name"),
      db.from("member_profiles").select(PROFILE_COLUMNS),
    ]);
    check(members.error); check(profiles.error);
    result.members = (members.data ?? []) as Member[];
    result.profiles = (profiles.data ?? []) as (Profile & { member_id: string })[];
  }
  return result;
}
export async function saveProfile(memberId: string, profile: Profile) {
  const { error } = await database().from("member_profiles").upsert({ ...profile, member_id: memberId, updated_at: new Date().toISOString() }, { onConflict: "member_id" });
  check(error);
}
export async function savePreference(memberId: string, input: PreferenceInput) {
  const { error } = await database().rpc("matching_save_preferences", {
    actor: memberId, cycle: input.cycle_id, ranked: input.ranked_project_ids, hours: input.hours_per_week, note: input.notes,
  });
  check(error);
}
export async function manageMatching(memberId: string, action: AdminAction) {
  const { error } = await database().rpc("matching_manage", { actor: memberId, payload: action });
  check(error);
}
