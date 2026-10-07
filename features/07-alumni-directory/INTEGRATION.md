# INTEGRATION · Alumni directory

## Setup

1. **Schema.** In the Supabase SQL editor, run `features/07-alumni-directory/db/schema.sql`
   after the root `db/schema.sql`, which creates `members`. It is safe to re-run. Until it has
   been run, `/portal/alumni` shows a "not set up yet" message rather than an error.

2. **Load the alumni.** The data file is kept out of git (`exports/` is gitignored):

   ```bash
   node --env-file=.env features/07-alumni-directory/scripts/import-alumni.mjs exports/alumni/<file>.json --dry-run
   node --env-file=.env features/07-alumni-directory/scripts/import-alumni.mjs exports/alumni/<file>.json
   ```

   The import only inserts. Anyone whose LinkedIn URL is already in the table is skipped, so
   re-running it never overwrites an edit exec made in the portal. Every row needs a
   `linkedin_url`, since that is the key used to dedupe.

After that, exec maintain the directory from the portal with Add alum and Edit. No redeploy
is needed.

## Where the first load came from (Oct 2026)

- **Alumni Database [UPDATED] sheet (PDF export).** This gave names, company, position,
  major, LinkedIn, and some emails and phones. The **Mentor?** checkboxes became
  `open_to_mentor`. The **On Campus?** checkbox was ticked for only one person, and that
  person has since graduated, so it was not used.
- **LinkedIn group "CUBE Consulting Active Members and Alumni".** This gave a current
  headline for everyone in the group, and added the people who weren't on the sheet. People
  on the current `members` roster were left out.
- **`campus_status`** was judged by hand from each LinkedIn headline. A student headline
  ("CS @ UIUC", "Student at University of Illinois") counts as on campus, and a job counts as
  off campus. Sheet-only rows whose last role was a full-time job are off campus. Sheet-only
  interns, and headlines that could go either way, are `unknown`. Exec should correct these
  as they learn more.

## Files outside this folder

| File | Change | Why |
|---|---|---|
| `app/portal/alumni/page.tsx` | Re-export shim | Registers the route |
| `app/api/alumni/route.ts`, `app/api/alumni/[id]/route.ts` | Re-export shims | Registers the API |
| `app/portal/layout.tsx` | "Alumni" nav link for every member | Entry point |
| `__tests__/alumni/alumni.test.ts` | Tests for `lib/alumni.ts` | |
