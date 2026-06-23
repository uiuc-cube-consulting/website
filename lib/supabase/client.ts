import { createClient } from "@supabase/supabase-js";

// Fallbacks keep `next build` from crashing during server-prerender of client
// components when NEXT_PUBLIC_SUPABASE_* aren't present at build time. The real
// values are inlined into the browser bundle at runtime when the env is set.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(url, anonKey);