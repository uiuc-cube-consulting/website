# CUBE Consulting Website

The cubeconsulting.org website, rebuilt in Next.js so the team can edit it in code instead of through the Wix editor. It also includes a members-only portal: a dashboard (calendar, points, resources), case studies, CUBE Brain, strikes, accountability, and recruiting tools.

- **First-time setup** (Supabase, SQL files, env vars): [SETUP.md](SETUP.md)
- **Portal features** (what each one is, how it's wired in): [features/README.md](features/README.md) and each `features/NN-*/README.md`

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4 with custom brand tokens
- **Auth:** NextAuth v5 (Auth.js) with Google sign-in. Access and roles come from the Supabase `members` table (`auth.ts`)
- **Data:** Supabase (Postgres + Storage) for members, points, strikes, recruiting, accountability and feedback
- **Email:** Gmail via nodemailer (`lib/email/send.ts`)
- **Hosting:** Vercel (includes a weekly cron in `vercel.json`)
- **Forms:** Formspree (public contact form)

## Local development

```bash
npm install
# create .env.local and set up Supabase: see SETUP.md
npm run dev                     # http://localhost:3000
```

The public site runs without any env vars. The portal needs Supabase and Google OAuth. See [SETUP.md](SETUP.md).

## Project structure

```
app/
  (public)/                public site: home, projects, services, about, join-us, contact, apply
  portal/                  members-only area (layout.tsx holds the role-aware nav)
  api/                     route handlers (many are one-line re-exports from features/)
features/                  self-contained portal features, each with its own app/, lib/, components/, db/
  01-case-study-engine/    /portal/case-studies
  02-pipeline-crm/         /portal/pipeline (currently switched off)
  03-recruitment-ats/      /apply, /portal/recruiting, /portal/interview, /portal/flags
  04-cube-brain-rag/       /portal/brain
  05-accountability-tracker/ /portal/accountability
  06-portal-feedback/      feedback widget + anonymous notes to exec
components/                shared UI; components/portal/ for portal-only pieces
lib/
  content.ts               single source of truth for site copy
  team.ts                  executive board roster
  supabase/                server (service role) and browser clients
  points.ts, point-*.ts    points ledger, categories, submissions
  strikes.ts               strike logic
  calendar.ts              Google Calendar reader (service account)
  email/                   nodemailer sender + strike emails
db/                        core SQL (members, strikes, points) and flag migrations
auth.ts                    NextAuth config: Google sign-in + `members` lookup → session.user.role
proxy.ts                   Next.js 16 "proxy" (formerly middleware): gates /portal/*
__tests__/                 Jest tests
scripts/                   one-off scripts
```

Pages under `app/` for features are usually thin shims (`export { default } from "@/features/..."`). The real code lives in the feature folder.

## Editing content

Almost all marketing copy lives in `lib/content.ts`. To update a project, FAQ, recruitment date, or alumni list, edit the relevant constant and commit. The Executive Board roster is in `lib/team.ts`.

## Routes

### Public

| Route | Purpose |
| --- | --- |
| `/` | Home |
| `/projects` | Current projects with team rosters |
| `/services` | Service categories, testimonials |
| `/about` | Mission, exec board, alumni placements |
| `/join-us` | Recruitment timeline, FAQs |
| `/apply` | Public recruitment application (feature 03) |
| `/contact` | Contact form (Formspree) |
| `/about-1`, `/s-projects-basic` | 308 redirects from old Wix URLs (`next.config.ts`) |

### Portal

Every `/portal/*` page except `/portal/sign-in` requires sign-in (`proxy.ts`). Roles are `exec`, `project_manager`, `senior_consultant`, `returning_member`, `member`. "Nav" is who sees the link in `app/portal/layout.tsx`. "Access" is who `proxy.ts` and the page let through.

| Route | Purpose | Nav | Access |
| --- | --- | --- | --- |
| `/portal/sign-in` | Google sign-in | n/a | Public |
| `/portal` | Dashboard: calendar, points, resources, anonymous note to exec | Everyone | Every member |
| `/portal/case-studies` | Searchable past-project library | Everyone | Every member |
| `/portal/brain` | CUBE Brain assistant over past projects | Everyone | Every member |
| `/portal/points/review` | Approve point submissions (linked from the dashboard) | None; exec get a dashboard card | `exec` |
| `/portal/strikes/new` | File a strike | `project_manager` | `exec`, `project_manager` |
| `/portal/strikes`, `/portal/strikes/[id]` | Strike review dashboard | `exec` | `exec` |
| `/portal/accountability` | Accountability ratings for your project seat | Every role | `exec`, `project_manager`, `senior_consultant`, `returning_member` (`member` is redirected) |
| `/portal/recruiting` | Applicant pool / review console | Every role while recruiting is open; `exec` only once closed | Same as nav (`canViewRecruiting`, checked in the page, not `proxy.ts`) |
| `/portal/interview` | Interview console | Every role while recruiting is open | Same as nav (`canInterviewRole` in `proxy.ts`, `canViewRecruiting` in the page) |
| `/portal/flags` | Red/green flags on applicants | Hidden while `FLAG_INTAKE_ENABLED` is `false` | Redirects to `/portal` while switched off |
| `/portal/pipeline` | Exec pipeline CRM | `exec`, only when `PIPELINE_ENABLED` | Redirects to `/portal` while switched off (currently off) |

`FLAG_INTAKE_ENABLED` and `PIPELINE_ENABLED` are constants in `features/03-recruitment-ats/lib/flag-intake-enabled.ts` and `features/02-pipeline-crm/lib/enabled.ts`. Recruiting visibility is an exec toggle stored in Supabase (`recruiting_settings`).

## Deploying to Vercel

1. Push to `main` on GitHub.
2. Import the repo at vercel.com → Add new project.
3. Add the env vars from [SETUP.md](SETUP.md) in the Vercel project's Environment Variables section. Set the `NEXT_PUBLIC_*` values before the first build.
4. Set `AUTH_TRUST_HOST=true` if Vercel doesn't auto-detect the deployment URL.
5. Add `https://<your-vercel-url>/api/auth/callback/google` as an authorized redirect URI on the Google OAuth client.

## Scripts

- `npm run dev`: local dev server
- `npm run build`: production build
- `npm run start`: serve the production build
- `npm run lint`: ESLint
- `npm test`: Jest (`__tests__/**/*.test.ts`)
- `node scripts/scrape-assets.mjs`: one-off; pulls images from the old Wix site into `public/scraped/`
