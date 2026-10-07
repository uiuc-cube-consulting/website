#!/usr/bin/env node
// Load alumni into Supabase from a local JSON file.
//
//   node --env-file=.env features/07-alumni-directory/scripts/import-alumni.mjs exports/alumni/<file>.json [--dry-run]
//
// The file is NEVER committed: the repo is public and the rows hold personal
// emails and phone numbers. Keep it under exports/ (gitignored).
//
// The file is a JSON array of objects with the `alumni` table's columns:
//   full_name (required), linkedin_url, headline, company, position, major,
//   email, phone, campus_status, open_to_mentor, source
//
// Insert-only. Anyone whose linkedin_url is already in the table is skipped,
// so re-running after exec have edited rows in the portal never undoes their
// edits. To change an existing row, edit it in /portal/alumni.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const COLUMNS = [
  "full_name", "linkedin_url", "headline", "company", "position", "major",
  "email", "phone", "campus_status", "open_to_mentor", "source",
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const path = args.find((a) => !a.startsWith("--"));
if (!path) {
  console.error("usage: import-alumni.mjs <file.json> [--dry-run]");
  process.exit(1);
}

const input = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(input)) throw new Error(`${path} must hold a JSON array.`);

const rows = input.map((r, i) => {
  if (!r.full_name?.trim()) throw new Error(`Row ${i} has no full_name.`);
  return Object.fromEntries(COLUMNS.filter((c) => r[c] !== undefined).map((c) => [c, r[c]]));
});

// Rows with no LinkedIn have nothing to dedupe on, so a re-run would add them
// twice. Refuse rather than guess; add those people by hand in the portal.
const unkeyed = rows.filter((r) => !r.linkedin_url);
if (unkeyed.length) {
  throw new Error(`${unkeyed.length} row(s) have no linkedin_url: ${unkeyed.map((r) => r.full_name).join(", ")}`);
}

const counts = rows.reduce((m, r) => ((m[r.campus_status ?? "unknown"] = (m[r.campus_status ?? "unknown"] ?? 0) + 1), m), {});
console.log(`${rows.length} alumni in ${path}`, counts);
if (dryRun) process.exit(0);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (pass --env-file=.env).");
const supabase = createClient(url, key);

// Fail early, with a useful message, if the schema hasn't been run.
const probe = await supabase.from("alumni").select("id").limit(1);
if (probe.error) {
  throw new Error(
    probe.error.code === "PGRST205"
      ? "The alumni table doesn't exist. Run features/07-alumni-directory/db/schema.sql first."
      : probe.error.message
  );
}

// With ignoreDuplicates, the returned rows are exactly the ones inserted.
const { data, error } = await supabase
  .from("alumni")
  .upsert(rows, { onConflict: "linkedin_url", ignoreDuplicates: true })
  .select("id");
if (error) throw new Error(error.message);

const inserted = data?.length ?? 0;
console.log(`Inserted ${inserted}; ${rows.length - inserted} were already there.`);
