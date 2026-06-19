// Authorization for the portal: who's a member, who's exec, and per-feature grants.
// Source of truth is the Supabase `members` table; when Supabase isn't configured we
// fall back to env allowlists so nothing breaks before/after the migration.
//
//   Authentication  → Google (NextAuth, see auth.ts)
//   Authorization   → this module (Supabase members table)
//
// Server-only (imports the Supabase admin client).

import { membersDb } from "./supabase";

export type Role = "exec" | "member";
export type Member = {
  email: string;
  name?: string | null;
  role: Role;
  active: boolean;
  pipeline_access: boolean;
};

function set(envVar: string): Set<string> {
  const raw = process.env[envVar];
  if (!raw) return new Set();
  return new Set(raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/** Look up a member by email. Supabase first; env fallback when unconfigured. */
export async function getMember(email: string | null | undefined): Promise<Member | null> {
  if (!email) return null;
  const e = email.toLowerCase();

  const db = membersDb();
  if (db) {
    const { data } = await db.from("members").select("*").eq("email", e).maybeSingle();
    if (!data) return null;
    return {
      email: data.email,
      name: data.name,
      role: data.role === "exec" ? "exec" : "member",
      active: Boolean(data.active),
      pipeline_access: Boolean(data.pipeline_access),
    };
  }

  // ── Env fallback (no Supabase) ──
  const execs = set("EXEC_ALLOWLIST");
  const pipelineGrants = set("PIPELINE_ALLOWLIST"); // non-exec members granted pipeline access
  if (execs.size === 0 && pipelineGrants.size === 0) return null; // unconfigured
  const isExecEnv = execs.has(e);
  return {
    email: e,
    role: isExecEnv ? "exec" : "member",
    active: true,
    pipeline_access: isExecEnv || pipelineGrants.has(e),
  };
}

export async function isExec(email: string | null | undefined): Promise<boolean> {
  const m = await getMember(email);
  return Boolean(m && m.active && m.role === "exec");
}

/**
 * Pipeline is exec-board-only, plus any member explicitly granted `pipeline_access`
 * (the "different restriction" for non-exec members we add).
 *
 * Safety: if a member source IS configured (Supabase or env), access is strict —
 * unknown/inactive users are denied. Only when NOTHING is configured do we fall back
 * to "any signed-in user" for local dev (mirrors auth.ts's empty-allowlist behavior).
 */
export async function canViewPipeline(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const configured = membersDb() !== null || set("EXEC_ALLOWLIST").size > 0 || set("PIPELINE_ALLOWLIST").size > 0;
  const m = await getMember(email);
  if (m) return m.active && (m.role === "exec" || m.pipeline_access);
  return configured ? false : true; // strict when configured; open in unconfigured dev
}

/** Is this a recognized, active member (any role)? For portal-wide gating. */
export async function isMember(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const configured = membersDb() !== null || set("EXEC_ALLOWLIST").size > 0;
  const m = await getMember(email);
  if (m) return m.active;
  return configured ? false : true;
}
