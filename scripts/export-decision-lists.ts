/**
 * Generate the named decision-list CSVs from the command line.
 *
 * The portal's own buttons are the normal way to get these files; this exists
 * for the case where somebody needs them without a browser session. It is the
 * SAME output by construction — it imports lib/export.ts and lib/cohort.ts
 * rather than reimplementing the filters, so a file produced here and one
 * downloaded from the dashboard are byte-identical.
 *
 * Reads only. Writes nothing to Supabase, and writes CSVs into ./exports, which
 * is gitignored — these files are applicant PII and do not belong in the repo.
 *
 * ONE DIFFERENCE FROM THE ROUTE, on purpose and worth knowing: the route runs as
 * a signed-in exec and drops that person's own application from every file
 * (lib/self-access.ts). A script has no viewer to exclude, and it holds the
 * service-role key, so it sees the whole cycle including the operator's own row
 * if they applied in a past one. That rule exists to stop someone reading their
 * own reviews; running this on your own cohort is the one case where it does not
 * hold, so use the dashboard buttons if that matters.
 *
 *   npx tsx scripts/export-decision-lists.ts            # every named list
 *   npx tsx scripts/export-decision-lists.ts offer      # one, by stage or label
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DECISION_EXPORTS,
  EXPORT_HEADERS,
  exportFilename,
  toCsv,
  toExportRow,
  type DecisionExport,
} from "../features/03-recruitment-ats/lib/export";
import { gatherEvidence, cohortOf, deepestRound } from "../features/03-recruitment-ats/lib/cohort";
import { SCREEN_MAX_POINTS, type Applicant, type Flag, type Review } from "../features/03-recruitment-ats/lib/types";

/** Just the two keys this needs. Parsed rather than sourced: .env holds a
 *  service-account JSON blob that a shell would mangle. */
function env(key: string): string {
  const line = readFileSync(".env", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  if (!line) throw new Error(`${key} missing from .env`);
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
}

async function main() {
  const want = process.argv.slice(2).map((a) => a.toLowerCase());
  const sb = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: settings } = await sb
    .from("recruiting_settings")
    .select("active_cycle")
    .eq("id", true)
    .maybeSingle();
  const cycle = (settings?.active_cycle as string | null) ?? "fa26";

  const [apps, revs, flgs, pnl] = await Promise.all([
    sb.from("applicants").select("*").eq("cycle", cycle),
    sb.from("reviews").select("*"),
    sb.from("applicant_flags").select("*").not("applicant_id", "is", null).is("removed_at", null),
    sb.from("interview_panel").select("applicant_id, round"),
  ]);
  for (const r of [apps, revs, flgs, pnl]) if (r.error) throw r.error;

  const applicants = (apps.data ?? []) as Applicant[];
  const ids = new Set(applicants.map((a) => a.id));
  const reviews = ((revs.data ?? []) as Review[]).filter((r) => ids.has(r.applicant_id));
  const flags = ((flgs.data ?? []) as Flag[]).filter((f) => f.applicant_id && ids.has(f.applicant_id));
  const evidence = gatherEvidence(reviews, (pnl.data ?? []) as { applicant_id: string; round?: string | null }[]);

  const tally = new Map<string, number>();
  for (const a of applicants) tally.set(a.stage, (tally.get(a.stage) ?? 0) + 1);
  console.log(`cycle ${cycle} — ${applicants.length} applicants`);
  console.log([...tally].sort().map(([s, n]) => `  ${s}: ${n}`).join("\n"));
  console.log();

  mkdirSync("exports", { recursive: true });
  const today = new Date();

  for (const x of DECISION_EXPORTS as DecisionExport[]) {
    if (want.length && !want.includes(x.label.toLowerCase()) && !want.includes(x.stage ?? "")) continue;

    // Exactly the branch app/api/recruitment/export/route.ts takes: on a
    // terminal stage the round means "LEFT AFTER this round", not "reached it".
    const terminal = x.stage === "rejected" || x.stage === "withdrawn";
    const selected =
      x.round && x.round !== "written" && terminal
        ? applicants.filter((a) => a.stage === x.stage && deepestRound(a, evidence) === x.round)
        : (() => {
            const inRound =
              x.round && x.round !== "written" ? cohortOf(x.round, applicants, evidence) : applicants;
            return x.stage ? inRound.filter((a) => a.stage === x.stage) : inRound;
          })();

    const rows = [...selected]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => toExportRow(a, reviews, flags, SCREEN_MAX_POINTS));

    const name = exportFilename(cycle, x.stage ?? null, today, x.round ?? null);
    writeFileSync(`exports/${name}`, toCsv([...EXPORT_HEADERS], rows));
    console.log(`${String(rows.length).padStart(4)}  ${x.label.padEnd(28)} exports/${name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
