import { database, StoreError } from "@/features/08-member-matching/lib/store";
import { normalizeLinkedIn } from "@/features/07-alumni-directory/lib/alumni";
import { listAlumni } from "@/features/07-alumni-directory/lib/store";
import type { Member } from "@/features/08-member-matching/lib/model";
import { buildNetwork, type SharedProfile, type Review, type ReviewInput } from "./network";

export async function loadNetwork(isExec: boolean) {
  const db = database();
  const [members, profiles, alumni, reviews] = await Promise.all([
    db.from("members").select("id,full_name,email,role,cohort").order("full_name"),
    // Never fetch private bios, learning goals or project preferences here.
    db.from("member_profiles").select("member_id,major,linkedin,interests,skills,directory_visible,open_to_mentor,share_email,updated_at"),
    listAlumni(),
    db.from("directory_reviews").select("member_id,alumni_id,linkedin_snapshot,identity_status,uiuc_status,source_url,notes,checked_at"),
  ]);
  const warnings: string[] = [];
  if (members.error) throw new StoreError("Could not load the current member roster.");
  if (profiles.error) warnings.push("Shared member profiles are unavailable. Exec should check the profile/network migrations.");
  if (!alumni.ok) warnings.push("The alumni directory could not be loaded; these results only include the member roster.");
  if (reviews.error) warnings.push("Source-review records are unavailable; no entries are marked reviewed.");
  return { rows: buildNetwork((members.data ?? []) as Member[], (profiles.error ? [] : profiles.data ?? []) as SharedProfile[], alumni.ok ? alumni.rows : [], (reviews.error ? [] : reviews.data ?? []) as Review[], isExec), warnings };
}
export async function saveReview(actor: string, input: ReviewInput) {
  const db = database();
  // Capture the actual linked profile, not a caller-supplied snapshot.
  const member = input.target_kind === "member";
  const target = member
    ? await db.from("members").select("id").eq("id", input.target_id).maybeSingle()
    : await db.from("alumni").select("id,linkedin_url").eq("id", input.target_id).maybeSingle();
  if (target.error) throw new StoreError("Could not load this directory record.");
  if (!target.data) throw new StoreError("Directory record no longer exists.", 404);
  let link: string | null = null;
  if (member) {
    const profile = await db.from("member_profiles").select("linkedin").eq("member_id", input.target_id).maybeSingle();
    if (profile.error) throw new StoreError("Could not load this member's shared profile.");
    link = normalizeLinkedIn(profile.data?.linkedin ?? "");
  } else link = normalizeLinkedIn((target.data as { linkedin_url?: string }).linkedin_url ?? "");
  if (input.identity_status === "evidence_found" && !link) throw new StoreError("Add a valid LinkedIn profile before marking the identity evidence reviewed.", 400);
  const key = member ? "member_id" : "alumni_id";
  const checked_at = new Date().toISOString();
  const { error } = await db.from("directory_reviews").upsert({
    [key]: input.target_id, [member ? "alumni_id" : "member_id"]: null,
    linkedin_snapshot: link, identity_status: input.identity_status, uiuc_status: input.uiuc_status,
    source_url: input.source_url, notes: input.notes, checked_by: actor, checked_at,
  }, { onConflict: key });
  if (error) throw new StoreError("Could not save the review. Check that the network migration has been applied.");
  return { checked_at };
}
