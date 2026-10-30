# Member profiles & semester project matching

`/portal/profile` gives every current roster member a persistent profile and a
separate set of ranked project preferences for each semester. Exec see the
**Matching workspace** tab on the same page.

## Enable

1. Deploy the code through the normal PR/release process.
2. Run `features/08-member-matching/db/schema.sql` in the Supabase SQL editor
   **after** `db/schema.sql`. This migration is additive and idempotent; it
   does not seed people, modify existing teams, or publish a semester.
3. As exec, open **My Profile → Matching workspace**, create a semester draft,
   and add each project with its brief, interest tags and planned team size.
4. Publish when the catalog is ready. Only one semester may be open. Catalog
   contents freeze on publish so saved choices cannot silently change.
5. Members rank **one to three** projects, give weekly availability and optional
   context, and save. Revisions replace the whole rank list atomically.
6. Exec review choices alongside profiles and filter interests or missing
   responses. Close preferences when ready to make placements.

Profiles stay across semesters. Preference lists never copy to the next cycle;
past cycles remain readable. Deadlines use `timestamptz`; the UI accepts and
shows local time. Close is irreversible in the portal. An expired open cycle
must be explicitly closed before the next is published.

## Privacy and authorization

- Profiles (including interests and learning goals) are private to their owner
  and exec. This does not publish a public biography or member directory.
- A request rechecks the live member roster, including the current role.
  Request bodies cannot change member identity, role, cohort or roster names.
- Ordinary members cannot retrieve draft catalogs, other members' profiles,
  other members' preferences, or the exec review roster.
- Supabase service-role credentials stay server-side. All new tables have RLS
  enabled and no anon/authenticated policies; RPC execution is service-only.
- A database transaction locks the cycle while saving or closing. Server time
  enforces deadlines; cross-semester/duplicate projects are rejected without
  destroying a previous response.
- Suggestions are transparent shared-interest tag matches, not AI inference.
  Selecting a project does not reserve capacity, assign a team, or write to
  accountability's existing `projects` / `project_members` tables.

Catalogs represent **candidate engagements**, not finalized accountability
teams. Final placement remains a leadership decision. All non-exec roster
members appear in the response view, regardless of profile completion; absence
of a response does not mean disinterest. Exec can submit their own preferences,
but the response denominator intentionally excludes exec.

## Validation

```sh
npx tsc --noEmit
npx eslint features/08-member-matching app/api/project-matching app/portal/profile __tests__/matching
npm test -- --runInBand
```

`__tests__/matching/schema.test.sql` exercises the database functions, atomic
replacement, deadlines, freeze/close, cross-semester isolation and grants.
Run only on a **disposable** PostgreSQL test database after the base and feature
schemas (and Supabase-compatible `anon`, `authenticated`, `service_role` roles).
The assertions use fictional records and roll back. Do not run on production.

Missing credentials/tables produce a visible setup/unavailable state, never
fake successful saves. Live Supabase/Google OAuth verification still requires
the authorized deployment; mock browser evidence must be labeled accordingly.
