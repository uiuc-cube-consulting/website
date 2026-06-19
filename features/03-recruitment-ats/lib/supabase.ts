// Server-only Supabase admin client. Uses the SERVICE ROLE key (bypasses RLS),
// so this must never be imported by client code. Returns null when unconfigured,
// which switches the store to demo mode.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function supabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return cached;
}

export function isConfigured(): boolean {
  return supabaseAdmin() !== null;
}
