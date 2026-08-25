# INTEGRATION · Accountability tracker

An auth-gated weekly QA grid at `/portal/accountability`, backed by Supabase (with a demo
fallback). This records the setup and every file outside the folder.

## Setup

> **Shared Supabase.** This feature reuses `lib/supabase/server.ts` → `createServerClient()`
> and the existing env vars — it does **not** add its own client. Its tables (`projects`,
> `project_members`, `accountability_ratings`, `accountability_reminders`) are separate from
> the strike and recruitment tables, so they coexist in one project.

1. **Schema** — in the Supabase SQL editor, run `features/05-accountability-tracker/db/schema.sql`
   (after the root `db/schema.sql`, which creates `members`).

2. **Projects + rosters** — edit and run `db/seed-projects-fa26.sql`. Two blocks to fill in:
   one row per project, and one row per person per project with the seat they hold **on that
   project**:

   | Seat | Means |
   |---|---|
   | `project_manager` / `senior_consultant` | Fills in the weekly grid |
   | `consultant` | Appears in it, and is rated |

   `starts_on` must be the **Monday of Week 1** — every "Week N" in the portal is derived
   from it. The file ends with two checks: emails not found in `members`, and projects with
   nobody who can fill the grid.

3. **Reminders** — set `CRON_SECRET` (`openssl rand -hex 32`) and `PORTAL_BASE_URL` in the
   Vercel project. `vercel.json` schedules `/api/accountability/remind` for **Fridays at
   14:00 UTC** (9am CDT / 8am CST — cron does not follow daylight saving; shift it in
   November if the hour matters). Delivery reuses `lib/email/send.ts` (`EMAIL_USER` /
   `EMAIL_PASS`), so there is no new mail credential.

Until Supabase is configured the tracker serves `lib/demo.ts` and writes are disabled, with
a banner saying so.

## Files outside this folder

| File | Change | Why |
|---|---|---|
| `app/portal/accountability/page.tsx` | **new** — shim | The grid + exec board route. |
| `app/api/accountability/route.ts` | **new** — shim (GET, POST) | Read a grid, save cells. |
| `app/api/accountability/overview/route.ts` | **new** — shim (GET) | Exec cross-project feed. |
| `app/api/accountability/remind/route.ts` | **new** — shim (GET, POST) | Weekly reminder job. |
| `app/portal/layout.tsx` | **+1 line** in `<nav>` | "Accountability" link for leadership. |
| `proxy.ts` | **+1 gate** | `/portal/accountability` → exec / PM / SC only. |
| `db/seed-projects-fa26.sql` | **new** | Projects + rosters, idempotent, with checks. |
| `vercel.json` | **new** | The weekly cron entry. |
| `.env.example` | **+ feature 05 section** | `CRON_SECRET`, `PORTAL_BASE_URL`. |
| `__tests__/accountability/` | **new** | Week math and access rules. |

Each route shim re-exports only the handlers and declares `dynamic` locally (route segment
config can't be re-exported).

> `.env.example` is matched by `.gitignore`'s `.env*` rule, so the documented vars don't get
> committed. That is pre-existing and affects every feature — noted here, not changed.

## Who can see what

Authorization lives in **`lib/access.ts`** — one set of predicates, imported by the routes
*and* by the page, so the UI never offers an action the API refuses.

- **Exec** reads and corrects every project. The cross-project board is exec-only.
- **Anyone holding a PM/SC seat** reads and fills only the projects they hold it on.
  `proxy.ts` gates the route by org role as a coarse first pass — including
  `returning_member`, because seats drift from titles (FA26 has two people holding an SC
  seat whose role is still `returning_member`, and gating on title would lock them out of
  their own grid). The seat is then checked again in the page and in every handler, so
  reaching the page grants nothing: without a seat you get an empty chooser, and a
  hand-crafted request carrying someone else's `project_id` gets a 403.
- **Consultants** see nothing — not even their own ratings. Deliberate; see SPEC.md.
- Ratings and notes are personnel data: they live behind RLS (deny-by-default for anon),
  only the server's service role touches them, and nothing is exposed to the public site.

## How a week is decided

`lib/week.ts` is pure and has no clock of its own — callers pass `today`, which is what
makes it testable. A project's `starts_on` plus `weeks` yields the current week; weeks roll
over at **midnight Central**, so a Sunday-night rating lands where the PM expects. Before
the start date nothing is rateable; past the final week the reminder job goes quiet instead
of clamping forever.

## Idempotency

- **Saving** — every cell is an upsert on `(project_id, member_id, week, category)`, so a
  double-click, a retry, or two tabs open converge instead of duplicating.
- **Reminders** — `accountability_reminders` is keyed `(project_id, week, recipient_id)`
  and only records sends that actually succeeded, so a failure is retried next run while a
  success is never repeated. Exec's "Send reminders now" button uses the same ledger.
- **Seeding** — `db/seed-projects-fa26.sql` upserts and never deletes; re-running it fixes
  dates and seats in place.

## Verify

```bash
npx tsc --noEmit
npx eslint features/05-accountability-tracker app/api/accountability app/portal/accountability
npx jest __tests__/accountability
# then npm run dev → /portal/accountability
```

## Commit as a unit

```bash
git add features/05-accountability-tracker \
        app/portal/accountability app/api/accountability \
        app/portal/layout.tsx proxy.ts vercel.json \
        db/seed-projects-fa26.sql __tests__/accountability
git commit -m "feat: accountability tracker — weekly consultant QA ratings (#5)"
```

## Remove cleanly

```bash
rm -rf features/05-accountability-tracker app/portal/accountability app/api/accountability \
       __tests__/accountability db/seed-projects-fa26.sql vercel.json
# revert the "Accountability" line in app/portal/layout.tsx and the gate in proxy.ts
# (optionally drop the four tables in Supabase)
```
