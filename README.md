# CUBE Consulting Website

The cubeconsulting.org website, rebuilt in Next.js so the team can edit it in code instead of through the Wix editor. Includes a members-only portal with calendar, points tracker, and resources.

## Stack

- **Framework:** Next.js 16 (App Router) + TypeScript
- **Styling:** Tailwind CSS v4 with custom brand tokens
- **Auth:** NextAuth v5 (Auth.js) with Google OAuth + email allowlist
- **Data:** Google Sheets API for the points tracker
- **Hosting:** Vercel
- **Forms:** Formspree (contact form)

## Local development

```bash
npm install
cp .env.example .env.local      # fill in real values, see "Configuration"
npm run dev                     # http://localhost:3000
```

## Project structure

```
app/
  layout.tsx               root layout (fonts, metadata)
  (public)/                public site
    layout.tsx             public header + footer
    page.tsx               home
    projects/, services/, about/, join-us/, contact/
    not-found.tsx
  portal/                  members-only area (auth-gated)
    layout.tsx             portal chrome
    page.tsx               dashboard
    sign-in/page.tsx
  api/
    auth/[...nextauth]/    NextAuth handlers
    points/                Sheets-backed points API
components/                shared UI (Header, Hero, ProjectShowcase, …)
components/portal/         portal-only components
lib/
  content.ts               single source of truth for site copy
  team.ts                  executive board roster
  sheets.ts                Google Sheets reader
auth.ts                    NextAuth config (Google + allowlist)
middleware.ts              protects /portal/*
public/                    images and downloadable assets
```

## Editing content

Almost all marketing copy lives in `lib/content.ts`. To update a project, FAQ, recruitment date, or alumni list, edit the relevant constant and commit. The Executive Board roster is in `lib/team.ts`.

## Configuration

All env vars are documented in `.env.example`. Summary:

### Public site

- `NEXT_PUBLIC_FORMSPREE_ID` — Formspree project ID for the Contact form. Without it the form simulates submissions in dev.

### Member portal — authentication

- `AUTH_SECRET` — `openssl rand -base64 32`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth client credentials. Set redirect URI to `https://<your-domain>/api/auth/callback/google`.
- `PORTAL_ALLOWLIST` — comma-separated lowercase emails. Anyone signed in via Google whose email isn't on this list will be bounced. Leave blank in dev to allow any Google user.

### Member portal — calendar

- `NEXT_PUBLIC_CALENDAR_EMBED_SRC` — the public embed `src` from Google Calendar. Calendar settings → "Integrate calendar" → "Embed code" → copy the `src=…` URL.

### Member portal — points tracker

- `POINTS_SHEET_ID` — long ID from the Sheet's URL.
- `POINTS_SHEET_RANGE` — defaults to `Points!A2:B`. Column A = name, Column B = points.
- `GOOGLE_API_KEY` — API key with Sheets API enabled. Share the Sheet "Anyone with the link can view".

If `POINTS_SHEET_ID` or `GOOGLE_API_KEY` is missing, the points UI falls back to a baked-in demo roster so the page is still explorable.

## Deploying to Vercel

1. Push to `main` on GitHub.
2. Import the repo at vercel.com → Add new project.
3. Add every var from `.env.example` in the Vercel project's Environment Variables section.
4. Set `AUTH_TRUST_HOST=true` if Vercel doesn't auto-detect the deployment URL.
5. Set the Google OAuth redirect URI to `https://<your-vercel-url>/api/auth/callback/google`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Home (hero, pillars, photo gallery, testimonials) |
| `/projects` | Spring 2026 projects with team rosters |
| `/services` | Multidisciplinary Solutions, service categories, testimonials |
| `/about` | Mission, exec board, alumni placements |
| `/join-us` | Recruitment timeline, FAQs, photo carousel |
| `/contact` | Contact form (Formspree) |
| `/portal` | Member dashboard (auth required) |
| `/portal/sign-in` | Google sign-in |
| `/about-1`, `/s-projects-basic` | 308 redirects to new slugs (old Wix URLs) |

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `node scripts/scrape-assets.mjs` — one-off: pulls images from the old Wix site into `public/scraped/`
