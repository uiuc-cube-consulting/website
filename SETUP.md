# CUBE Portal — Setup (strike_system foundation)

This branch adds the Supabase foundation (members + roles + auth) and the strike
management system. Follow these steps once; later feature branches build on this.

## 1. Install dependencies

```bash
npm install
```
Pulls `@supabase/supabase-js` and `resend` (both are in `package.json` / lockfile).

## 2. Create the database

In your Supabase project's SQL editor, run these (same project for all):
- **`db/schema.sql`** — `members` and `strikes` tables.
- **`features/03-recruitment-ats/db/schema.sql`** — recruitment ATS (`applicants`, `reviews`, …).
- **`features/02-pipeline-crm/db/schema.sql`** — `pipeline_leads` (the editable pipeline board).

> **Seed `members` before anyone signs in.** `auth.ts` rejects sign-in for any email
> not in `members`, so the portal is inaccessible until the table is seeded. Edit the
> seed block at the bottom of `db/schema.sql` with your exec board's emails and run it.

Roles: `exec`, `project_manager`, `senior_consultant`, `returning_member`, `member`.
`proxy.ts` gates `/portal/admin` to `exec` and `/portal/recruitment` to the first four.

## 3. Environment variables

Set these in `.env.local` (local) **and** in the Vercel project (before deploying —
the browser Supabase client needs the `NEXT_PUBLIC_*` values at build time):

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (server only — secret) |
| `RESEND_API_KEY` | Resend key for strike notification emails |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client |
| `GOOGLE_API_KEY`, `POINTS_SHEET_ID`, `POINTS_SHEET_RANGE` | Points tracker (existing) |
| `NEXT_PUBLIC_CALENDAR_EMBED_SRC`, `NEXT_PUBLIC_FORMSPREE_ID` | Calendar embed / contact form (existing) |

## 4. Run

```bash
npm run dev      # http://localhost:3000
npm run build    # production build (set the NEXT_PUBLIC_* vars first)
```

## Notes

- The Supabase clients live in `lib/supabase/` — `server.ts` (service role, server only)
  and `client.ts` (browser, anon). `client.ts` falls back to placeholder values so a
  build won't crash if env is briefly missing, but set the real vars for it to work.
- The same Supabase project is reused by the recruitment ATS on the features branch
  (its tables are separate); don't create a second project.
