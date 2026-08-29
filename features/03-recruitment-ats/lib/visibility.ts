// The recruiting settings singleton: whether the area is open to non-exec
// members, and which cycle it is currently running.
//
// Exec can close recruiting once a cycle ends (applicants, flags, reviews,
// decisions all go dark for everyone else) and reopen it when the next cycle
// starts, without a deploy.
//
// Backed by a singleton row (db/visibility.sql, extended by db/cycles.sql)
// rather than code constants like PIPELINE_ENABLED, because both of these
// change every semester and exec — not a developer — needs to change them.

import { createServerClient } from "@/lib/supabase/server";
import { cycleForDate, normalizeCycle, type Cycle } from "./cycle";

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

// ── The active cycle ─────────────────────────────────────────────────────────

/**
 * Which cycle recruiting is currently running — the cohort a new application
 * joins, and the one every dashboard is scoped to by default.
 *
 * Falls back to the cycle matching today's date whenever the setting is absent:
 * demo mode, a fresh install, or a row nobody has touched yet. That fallback is
 * why this never returns null — an application must always land in *some*
 * cohort, and refusing to accept one because exec had not clicked a button
 * would close intake at exactly the wrong moment. The database applies the same
 * date-derived default (db/cycles.sql) if an insert somehow arrives without one.
 */
export async function getActiveCycle(): Promise<Cycle> {
  const sb = db();
  if (!sb) return cycleForDate();
  const { data, error } = await sb
    .from("recruiting_settings")
    .select("active_cycle")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return cycleForDate();
  return normalizeCycle(data.active_cycle as string | null) ?? cycleForDate();
}

/**
 * Exec opens a new cycle. This does not close the old one or touch its data —
 * previous cohorts stay queryable, which is the whole point of storing a cycle
 * per application rather than clearing the table each semester.
 *
 * The value is canonicalised before it is written, so "Fall 2026", "fa2026" and
 * "FA26" all end up as the single key `fa26` and cannot fragment one cohort
 * across three spellings.
 */
export async function setActiveCycle(
  cycle: string,
  updatedBy: string
): Promise<{ ok: boolean; demo?: boolean; error?: string; cycle?: Cycle; invalid?: boolean }> {
  const canonical = normalizeCycle(cycle);
  if (!canonical) {
    // `invalid` separates "you typed something that isn't a cycle" from "the
    // write failed", so the route can answer 400 rather than 500 and the caller
    // knows whether retrying is pointless.
    return { ok: false, invalid: true, error: "Enter a cycle like 'fa26' or 'Fall 2026'." };
  }

  const sb = db();
  if (!sb) return { ok: false, demo: true };
  const { error } = await sb.from("recruiting_settings").upsert({
    id: true,
    active_cycle: canonical,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, cycle: canonical };
}

/**
 * Resolve the cycle a request should operate on: an explicit `?cycle=` when it
 * names a real cycle, otherwise the active one.
 *
 * Callers pass user input straight in — an unparseable value falls back to the
 * active cycle rather than erroring, because a stale bookmark or a typo in a
 * query string should show the current cohort, not a 400.
 */
export async function resolveCycle(requested: string | null | undefined): Promise<Cycle> {
  return normalizeCycle(requested) ?? (await getActiveCycle());
}
