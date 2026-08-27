// Whether the recruiting area is open to non-exec members. Exec can close it
// once a cycle ends (applicants, flags, reviews, decisions all go dark for
// everyone else) and reopen it when the next cycle starts, without a deploy.
//
// Backed by a singleton row (db/visibility.sql) rather than a code constant
// like PIPELINE_ENABLED, because this flips every cycle and exec — not a
// developer — needs to flip it.

import { createServerClient } from "@/lib/supabase/server";

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

/** Defaults to visible when Supabase isn't configured (demo mode) or the row is missing. */
export async function isRecruitingVisible(): Promise<boolean> {
  const sb = db();
  if (!sb) return true;
  const { data, error } = await sb.from("recruiting_settings").select("visible").eq("id", true).maybeSingle();
  if (error || !data) return true;
  return data.visible;
}

/** Exec always sees recruiting; everyone else only when it's open. */
export async function canViewRecruiting(role: string | null | undefined): Promise<boolean> {
  if (role === "exec") return true;
  return isRecruitingVisible();
}

export async function setRecruitingVisible(
  visible: boolean,
  updatedBy: string
): Promise<{ ok: boolean; demo?: boolean; error?: string }> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };
  const { error } = await sb
    .from("recruiting_settings")
    .upsert({ id: true, visible, updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
