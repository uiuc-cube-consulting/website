# INTEGRATION · Recruitment ATS

Built as a public intake page + an auth-gated reviewer console, backed by Supabase
(with demo fallback). This records the Supabase setup and every file outside the folder.

## Supabase setup (to persist data)

> First: `npm install`. `@supabase/supabase-js` is already in `package.json` but this feature
> is the first code to import it, so make sure deps are installed (otherwise `tsc`/`next build`
> will report "Cannot find module '@supabase/supabase-js'").

1. Create a Supabase project (free tier is fine).
2. In the SQL editor, run `db/schema.sql` (creates tables + enables RLS).
3. Project Settings → API → copy the **Project URL** and the **service_role** key.
4. Set in `.env.local` (and Vercel env):
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # secret — server only
   ```
The service role key is used only in server code (`lib/supabase.ts`) and bypasses RLS;
RLS is left deny-by-default so the anon role has no direct table access. Until these are set,
the app uses `lib/demo.ts` and writes are disabled.

## Files outside this folder

| File | Change | Why |
|---|---|---|
| `app/(public)/apply/page.tsx` | **new** — shim | Public `/apply` intake route. |
| `app/portal/recruiting/page.tsx` | **new** — shim | Auth-gated reviewer console route. |
| `app/api/recruitment/apply/route.ts` | **new** — shim (POST) | Public intake submit. |
| `app/api/recruitment/applicants/route.ts` | **new** — shim (GET) | Reviewer feed. |
| `app/api/recruitment/reviews/route.ts` | **new** — shim (POST) | Submit a review. |
| `app/api/recruitment/decisions/route.ts` | **new** — shim (POST) | Stage decisions. |
| `app/portal/layout.tsx` | **+1 line** in `<nav>` | "Recruiting" link. |
| `.env.example` | **+ Supabase section** | Documents the two env vars. |

Each route shim re-exports only the handler and declares `dynamic` locally (route segment
config can't be re-exported).

### Optional: point Join Us at the new intake

`SITE.applyForm` in `lib/content.ts` is currently the Google Form. To switch recruiting to
the structured intake, change the Join Us apply CTA to link to `/apply` (left unchanged here
so nothing breaks before Supabase is configured).

## How auth + privacy work

- `/portal/recruiting` is gated by `proxy.ts` + a page session check.
- The reviewer feed returns aggregates and **your own** review, never other reviewers'
  individual scores/notes — so scoring stays blind-ish until you submit.
- Applicant data is sensitive: it lives in Supabase behind RLS; only the server (service role)
  touches it; define a retention policy per cycle.

## Verify

```bash
npx tsc --noEmit
npx eslint features/03-recruitment-ats
# then npm run dev → /apply and /portal/recruiting
```

## Commit as a unit

```bash
git add features/03-recruitment-ats \
        "app/(public)/apply" app/portal/recruiting app/api/recruitment \
        app/portal/layout.tsx .env.example
git commit -m "feat: recruitment ATS — intake + reviewer console + analytics (#3)"
```

## Phase 2 (scoped in SPEC.md)

Interview scheduling (`interview_slots`/`interviews` tables are already in the schema),
templated decision emails (reuse the bot's Gmail/service-account send), reviewer assignment
to balance load, and migrating the Join Us CTA to `/apply`.

## Remove cleanly

```bash
rm -rf features/03-recruitment-ats "app/(public)/apply" app/portal/recruiting app/api/recruitment
# remove the "Recruiting" line from app/portal/layout.tsx and the Supabase block in .env.example
# (optionally drop the tables in Supabase)
```
