import { normalizeLinkedIn, type Alumnus } from "@/features/07-alumni-directory/lib/alumni";
import { InputError, id, type Member, type Profile } from "@/features/08-member-matching/lib/model";

export type SharedProfile = Pick<Profile, "major" | "linkedin" | "interests" | "skills" | "directory_visible" | "open_to_mentor" | "share_email"> & { member_id: string; updated_at: string };
export type Review = NonNullable<Alumnus["review"]> & { member_id: string | null; alumni_id: string | null; linkedin_snapshot: string | null };
export type ReviewInput = {
  target_kind: "member" | "alumni"; target_id: string;
  identity_status: "unknown" | "evidence_found" | "conflict";
  uiuc_status: "unknown" | "evidence_found" | "conflict";
  source_url: string; notes: string;
};

export function parseReview(value: unknown): ReviewInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InputError("Expected a review object.");
  const v = value as Record<string, unknown>;
  if (v.target_kind !== "member" && v.target_kind !== "alumni") throw new InputError("Choose a member or alumni record.");
  for (const key of ["identity_status", "uiuc_status"]) {
    if (!["unknown", "evidence_found", "conflict"].includes(v[key] as string)) throw new InputError("Choose an evidence status.");
  }
  if (typeof v.notes !== "string" || v.notes.length > 600) throw new InputError("Keep review notes under 600 characters.");
  if (typeof v.source_url !== "string" || v.source_url.length > 500) throw new InputError("Invalid evidence URL.");
  const raw = v.source_url.trim();
  if (raw) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new InputError("Use an https evidence URL."); }
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || !(host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "illinois.edu" || host.endsWith(".illinois.edu"))) throw new InputError("Use an https LinkedIn or illinois.edu source.");
  }
  if ((v.identity_status !== "unknown" || v.uiuc_status !== "unknown") && !raw) throw new InputError("Add a source for the status you reviewed.");
  return { target_kind: v.target_kind, target_id: id(v.target_id), identity_status: v.identity_status as ReviewInput["identity_status"], uiuc_status: v.uiuc_status as ReviewInput["uiuc_status"], source_url: raw, notes: v.notes.trim() };
}

/** Names are not identity keys. Deduplicate only exact LinkedIn/email matches. */
export function buildNetwork(members: Member[], profiles: SharedProfile[], alumni: Alumnus[], reviews: Review[], isExec: boolean): Alumnus[] {
  const memberEmails = new Set(members.map((m) => m.email.trim().toLowerCase()));
  const memberLinks = new Set(profiles.map((p) => normalizeLinkedIn(p.linkedin)?.toLowerCase()).filter(Boolean));
  const current = members.map((m): Alumnus => {
    const p = profiles.find((p) => p.member_id === m.id);
    const shared = p?.directory_visible === true;
    return {
      id: `member:${m.id}`, member_id: m.id, membership: m.role === "exec" ? "exec" : "member",
      full_name: m.full_name || "CUBE member", headline: m.role.replaceAll("_", " "),
      linkedin_url: shared ? normalizeLinkedIn(p?.linkedin ?? "") : null,
      company: null, position: null, major: shared ? p?.major ?? null : null,
      interests: shared ? p?.interests ?? [] : [], skills: shared ? p?.skills ?? [] : [],
      email: shared && p?.share_email ? m.email : null, phone: null,
      campus_status: "unknown", open_to_mentor: shared && p?.open_to_mentor === true,
      source: "manual", updated_at: p?.updated_at ?? "", profile_confirmed_at: shared ? p?.updated_at ?? null : null,
    };
  });
  const former = alumni.filter((a) => !(
    (a.email && memberEmails.has(a.email.trim().toLowerCase()))
    || (a.linkedin_url && memberLinks.has(normalizeLinkedIn(a.linkedin_url)?.toLowerCase()))
  )).map((a) => ({ ...a, membership: "alumni" as const }));
  return [...current, ...former].map((row) => {
    const review = reviews.find((r) => row.member_id ? r.member_id === row.member_id : r.alumni_id === row.id);
    // Editing a LinkedIn link invalidates the previous link/education linkage.
    // An unshared member link must not be disclosed through review source URLs.
    const sameLink = (normalizeLinkedIn(review?.linkedin_snapshot ?? "") ?? "").toLowerCase() === (normalizeLinkedIn(row.linkedin_url ?? "") ?? "").toLowerCase();
    if (!review || !sameLink || (row.member_id && !row.linkedin_url)) return { ...row, review: null };
    return { ...row, review: { identity_status: review.identity_status, uiuc_status: review.uiuc_status, source_url: review.source_url, checked_at: review.checked_at, ...(isExec ? { notes: review.notes } : {}) } };
  });
}
