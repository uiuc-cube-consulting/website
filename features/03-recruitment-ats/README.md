# 03 · Recruitment ATS

An applicant tracking system in the member portal: structured intake → multi-reviewer
scoring on a **calibrated rubric** → funnel analytics, gated behind the existing portal auth.
Replaces the `forms.gle` + manual-review workflow. This is the project that most directly
compounds — better recruiting → better members → better deliverables.

Backed by **Supabase** (already a dependency). Until it's configured, the console and
analytics run on demo data so you can explore the whole flow; writes are disabled in demo mode.

The public intake route accepts only the form's seven text fields: short fields
are capped at 200 characters, `why` and `proud` at 3,000. The shared validator in
`lib/intake.ts` rejects malformed or oversized input, drops unknown fields, and
silently accepts filled honeypots without writing. Browser `maxLength` values use
the same constants. These guards are not a replacement for rate limiting.

```
03-recruitment-ats/
  README.md            ← you are here
  SPEC.md              scope, schema, rubric, task breakdown, metrics
  INTEGRATION.md       Supabase setup + every file outside the folder + how to remove
  db/
    schema.sql         Postgres schema + RLS — run once in the Supabase SQL editor
  lib/
    types.ts           PURE: stages, the calibrated rubric, scoring + funnel helpers
    demo.ts            demo applicants + reviews (used until Supabase is set)
    store.ts           SERVER-ONLY: data access (uses the shared lib/supabase/server
                       client from the strike_system PR); demo fallback when unconfigured
  components/
    IntakeForm.tsx        public application form
    RecruitingDashboard.tsx  reviewer console + funnel/calibration analytics
  app/
    (public)/apply/page.tsx        public intake page
    portal/recruiting/page.tsx     reviewer console (auth-gated)
    api/recruitment/apply          POST  (public)
    api/recruitment/applicants     GET   (auth) — aggregates + your own review
    api/recruitment/reviews        POST  (auth) — submit/update your review
    api/recruitment/decisions      POST  (auth) — advance / reject
```

## Run it

```bash
npm run dev
# public:  http://localhost:3000/apply
# reviewers (sign in): http://localhost:3000/portal/recruiting
```

To persist data, set `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (the same vars
the strike_system PR uses) and run `db/schema.sql` in Supabase. See INTEGRATION.md.
