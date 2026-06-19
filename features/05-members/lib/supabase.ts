// Server-only Supabase admin client for the member directory. Same env as the ATS
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY). Returns null when unconfigured, which
// makes the members module fall back to env allowlists. Never import from client code.
//
// (If you later hoist a single shared Supabase client to a root lib, point both this
//  and features/03-recruitment-ats/lib/supabase.ts at it.)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function membersDb(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}
