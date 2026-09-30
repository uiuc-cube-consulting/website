# CUBE Portal — Setup

How to go from a fresh clone to a working portal: Supabase database, env vars, and
running locally. For what each portal feature does, see
[features/README.md](features/README.md); for the route map, see [README.md](README.md).

## 1. Install dependencies

```bash
npm install
```

## 2. Create the database

Create one Supabase project and use it for everything. Every feature's tables live
in it side by side. In the Supabase SQL editor, run these files **in this order**.
All of them are idempotent, so re-running one is safe.

**Core (members, strikes, points)**

1. `db/schema.sql`: `members` and `strikes`. Everything else references `members`.
2. `db/points.sql`: `point_entries` ledger
3. `db/point-categories.sql`: adds a category to each point entry
4. `db/point-submissions.sql`: member-submitted points, plus the private `point-evidence` storage bucket

**Recruitment ATS (feature 03: `/apply`, `/portal/recruiting`, `/portal/interview`, `/portal/flags`)**

5. `features/03-recruitment-ats/db/schema.sql`: `applicants`, `reviews`, `assignments`, `decisions`, interview tables
6. `features/03-recruitment-ats/db/visibility.sql`: `recruiting_settings` (the exec open/closed toggle)
7. `features/03-recruitment-ats/db/cycles.sql`: per-semester applications
8. `features/03-recruitment-ats/db/resume-linking.sql`
9. `features/03-recruitment-ats/db/interview.sql`: interview panel and review kinds
10. `features/03-recruitment-ats/db/rounds.sql`: three-round cycle
11. `features/03-recruitment-ats/db/drive-folders.sql`: per-candidate Drive folders
12. `features/03-recruitment-ats/db/final-round-folders.sql`
13. `features/03-recruitment-ats/db/flags.sql`: `applicant_flags`
14. `db/flag-removal.sql`: soft-delete for flags (needs `flags.sql`)
15. `db/flag-anonymity.sql`: anonymous-by-default flags (needs `flags.sql`)

**Accountability tracker (feature 05)**

16. `features/05-accountability-tracker/db/schema.sql`: `projects`, `project_members`, ratings, reminders

**Portal feedback (feature 06)**

17. `features/06-portal-feedback/db/schema.sql`: `portal_feedback`, plus the private `feedback-screenshots` bucket
18. `features/06-portal-feedback/db/anonymous.sql`: rate-limit table for anonymous notes to exec

**Optional: pipeline CRM (feature 02)**

19. `features/02-pipeline-crm/db/schema.sql`: `pipeline_leads`. The pipeline is switched off
    (`features/02-pipeline-crm/lib/enabled.ts`), so you can skip this one.

> **Seed `members` before anyone signs in.** `auth.ts` rejects sign-in for any email
> that isn't in `members`, and reads the user's `role` and `cohort` from that row. Use the
> commented seed block at the bottom of `db/schema.sql` as a template: put in your
> own email(s) with role `exec` and run it.
>
> `db/seed-members-fa26.sql` and `db/seed-projects-fa26.sql` hold the club's real
> roster for the production database. Don't run them against a dev project.
> `seed-projects-fa26.sql` also depends on a seed file that isn't on `main` yet.

Roles (the `members.role` check constraint): `exec`, `project_manager`,
`senior_consultant`, `returning_member`, `member`. Who can open each portal page is
listed in the [README routes table](README.md#portal). The sources of truth are
`app/portal/layout.tsx` (nav) and `proxy.ts` (route gating). `proxy.ts` doesn't
role-gate `/portal/recruiting`. Any signed-in member gets through, and the page
itself hides the pool from non-exec while recruiting is closed. Finer permissions
(scoring, decisions, final round) are enforced inside the API routes
(`features/03-recruitment-ats/lib/access.ts`).

## 3. Environment variables

Put these in `.env.local` for local development **and** in the Vercel project for
deploys. The browser Supabase client needs the `NEXT_PUBLIC_*` values at build time,
so set them before building.

> There's no committed `.env.example` yet. `.gitignore` currently ignores `.env*`, and
> #44 tracks adding a complete one. Until then, use the tables below.

**Required for the portal**

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser client) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. Server only, keep it secret |
| `AUTH_SECRET` | NextAuth secret: `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client. Redirect URI: `http://localhost:3000/api/auth/callback/google` (and your deployed URL) |

NextAuth reads the `AUTH_*` vars automatically, so they won't show up in a grep for
`process.env`.

**Optional, by feature.** The portal runs without these. Only the feature that needs one is affected.

| Var(s) | Used for |
|---|---|
| `EMAIL_USER`, `EMAIL_PASS` | Outgoing email (`lib/email/send.ts`, Gmail via nodemailer). `EMAIL_PASS` is a Gmail **app password**. Used by strike notices, accountability reminders, and anonymous notes |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `CALENDAR_ID` | Dashboard calendar (`lib/calendar.ts`). Share the calendar with the service account's `client_email`. The same service account is used for Drive/Sheets in recruiting and the pipeline |
| `NEXT_PUBLIC_FORMSPREE_ID` | Public contact form. Without it the form simulates a submission |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | CUBE Brain synthesized answers. Without a key it returns extractive answers |
| `FEEDBACK_GITHUB_TOKEN`, `FEEDBACK_GITHUB_REPO`, `FEEDBACK_GITHUB_ASSIGNEE`, `FEEDBACK_RATE_LIMIT` | Feedback widget → GitHub issues |
| `ANONYMOUS_REPORT_RECIPIENTS`, `ANONYMOUS_REPORT_SALT`, `ANONYMOUS_REPORT_RATE_LIMIT` | Anonymous notes to exec |
| `PORTAL_BASE_URL` | Absolute links in emails/issues (falls back to `VERCEL_URL`) |
| `CRON_SECRET` | Authenticates the Vercel cron that calls `/api/accountability/remind` (`vercel.json`) |
| `RECRUITMENT_IMPORT_SHEET_ID`, `RECRUITING_FORM_SHEET_ID`, `RECRUITING_FORM_SHEET_RANGE`, `RECRUITING_DRIVE_ROOT_FOLDER_ID`, `RECRUITING_RESUME_FOLDER_ID`, `RECRUITING_PROVISION_BATCH` | Recruiting imports, resume linking, and Drive folder provisioning |
| `GOOGLE_API_KEY` | Read-only Sheets access for the recruiting import and the pipeline (the service account is the alternative) |
| `PIPELINE_SHEET_ID` (or `SHEET_ID`), `PIPELINE_SHEET_RANGE`, `PIPELINE_EXEC_ALLOWLIST` | Pipeline CRM (switched off) |

> **Strike emails not arriving?** Filing a strike still succeeds when the email fails.
> The send is best-effort, and the error is logged in the Vercel function logs, not
> shown to the user. Check that `EMAIL_USER`/`EMAIL_PASS` are set in the right Vercel
> environment, that `EMAIL_PASS` is an app password (2-Step Verification must be on
> for that Google account), and that you redeployed after setting them.

## 4. Run

```bash
npm run dev      # http://localhost:3000, then sign in at /portal/sign-in with a seeded email
npm test         # Jest
npm run build    # production build (set the NEXT_PUBLIC_* vars first)
```

## Notes

- The Supabase clients live in `lib/supabase/`: `server.ts` (service role, server
  only) and `client.ts` (browser, anon). `client.ts` falls back to placeholder values
  so a build won't crash if env is briefly missing, but set the real vars for it to work.
- Every table has RLS enabled with no anon policies. All reads and writes go through
  API routes using the service role, with auth enforced by NextAuth, `proxy.ts`, and the
  routes themselves.
- `proxy.ts` is Next.js 16's replacement for `middleware.ts`. Its matcher covers every
  `/portal` path except `/portal/sign-in`.
