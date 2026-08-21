# INTEGRATION · Recruitment ATS

Built as a public intake page + an auth-gated reviewer console, backed by Supabase
(with demo fallback). This records the Supabase setup and every file outside the folder.

## Supabase setup (to persist data)

> **Shared Supabase, no overlap with the `strike_system` PR.** This feature reuses that PR's
> client (`lib/supabase/server.ts` → `createServerClient()`) and its env vars — it does **not**
> add its own client. The recruitment tables (`applicants`, `reviews`, …) are separate from
> strike_system's (`members`, `strikes`), so they coexist in one project.
>
> `npm install` first — both PRs use `@supabase/supabase-js` (already in `package.json`).

1. Use the same Supabase project as strike_system (or create one if landing this first).
2. In the SQL editor, run `db/schema.sql` (creates the recruitment tables + enables RLS).
3. Set the shared env vars (same ones strike_system documents):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # secret — server only
   ```
The service role key is used only in server code (via `lib/supabase/server.ts`) and bypasses
RLS; RLS is deny-by-default so anon has no direct table access. Until these are set, the app
uses `lib/demo.ts` and writes are disabled.

> Depends on the strike_system PR's `lib/supabase/server.ts`. If landing this branch first,
> add that 8-line file (or rebase onto strike_system).

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

## Reviewer assignment + import (built)

- **Random reviewer assignment** — exec hits "Assign reviewers" → `POST /api/recruitment/assign`
  randomly + evenly assigns `k` (default 2) reviewers to every active applicant (no self-review,
  balanced load, top-up-aware). The reviewer pool = members with a reviewer role
  (`exec`, `project_manager`, `senior_consultant`, `returning_member`) from the `members` table.
  Reviewers then use the **My queue** toggle to see only their assigned applicants + progress.
- **Google Sheet import** — exec pastes a responses sheet URL → `POST /api/recruitment/import`
  reads it (fuzzy header mapping: name/email/year/major/college; other columns → `responses`),
  deduped by email. Or set `RECRUITMENT_IMPORT_SHEET_ID` and call with no body. Needs
  `GOOGLE_SERVICE_ACCOUNT_JSON` or `GOOGLE_API_KEY` (same as the pipeline reader).

## Interview console (built)

`/portal/interview` — an interviewer searches a candidate's name and gets their **resume, case
rubric, and behavioral rubric on one screen**, without hunting for a resume or duplicating two
grading docs by hand.

Per-candidate Drive folders are back alongside it (see *Candidate Drive folders* below) for
interviewers who prefer grading in Docs. The portal stays the system of record for scores,
stages and panels; Drive is a parallel working surface, and the two are joined by
`applicants.drive_folder_id`.

### Setup

1. Run **`db/interview.sql`** in the Supabase SQL editor (after `db/schema.sql`). It adds the
   resume columns on `applicants`, a `kind` + `recommendation` on `reviews` — widening the
   uniqueness key to `(applicant_id, reviewer_email, kind)` — and the `interview_panel` table.
2. Put this cycle's resumes in **one Drive folder** and share it with the service account's
   `client_email` as Viewer. Set `RECRUITING_RESUME_FOLDER_ID` (or paste the URL in the UI).
   `GOOGLE_SERVICE_ACCOUNT_JSON` is required — an API key can only read world-readable files.
3. Exec hits **Sync resumes**, then assigns an **interview panel** per candidate.

### How resumes get sorted automatically

`lib/resume-match.ts` (pure, no I/O) matches filenames to applicants in four tiers, taking the
first that resolves to exactly one person: an **email/netid** in the filename → the **exact
name** → the **same tokens in any order** (`Doe_Jane`) → a **fuzzy** token-overlap match that
must clear 0.6 *and* beat the runner-up by 0.2. Noise (`resume`, `CV`, `final`, `v2`, years,
`(1)`) is stripped first. Ties are reported, never guessed — two `Emily`s and one
`Emily Resume.pdf` lands in the unmatched list rather than on the wrong candidate. When one
person has several files, the strongest match wins and the newest breaks ties.

Cost is one hash-indexing pass plus one pass over files; the fuzzy tier pulls candidates from
an inverted token index rather than scanning all pairs. 2,000 files × 2,000 applicants matches
in ~8ms, so a sync is dominated by the Drive call, not the matching.

Re-running is safe and only tops up. The result reports what was linked, what matched only
fuzzily (worth a spot-check), which files matched nothing, and which candidates still have no
resume — rename in Drive and re-run.

### Who can edit what

- The **rubric templates live in code** (`lib/interview.ts`) — no endpoint can change them.
- An interviewer fills in **their own instance** of a rubric for a candidate: a separate row per
  `(candidate, interviewer, kind)`, so two panelists never overwrite each other.
- Writes are gated on **`interview_panel` membership**, enforced in the route *and* in the store.
  You can read any candidate; you can only score the ones you're interviewing. Exec can correct
  any rubric.
- Resumes stream through `GET /api/recruitment/resume/[applicantId]` under the portal session.
  The Drive file id never reaches the browser and the folder is never shared to individuals.
- `aggregate()` in `lib/types.ts` now filters to `kind = 'screen'`, so interview scores can't
  silently distort the application-screen means on `/portal/recruiting`.

## Candidate Drive folders (built)

Recruiting intake runs through a Google Form whose responses land in a sheet, with each
resume arriving as a **Drive link**. Exec hits **Provision candidate folders** on
`/portal/interview` and every respondent gets:

```
CUBE Recruiting/                     ← RECRUITING_DRIVE_ROOT_FOLDER_ID, made by hand once
└── Fall 2026/                       ← RECRUITING_CYCLE_LABEL
    └── Jane Doe — jdoe2@illinois.edu/
        ├── Resume — Jane Doe.pdf        copy of the Form upload
        ├── Case Rubric — Jane Doe       generated Google Doc
        ├── Behavioral Rubric — Jane Doe generated Google Doc
        └── Interview Notes — Jane Doe   blank, for the panel to type into live
```

### Why the Form changes the resume story

The Form gives an **authoritative candidate → resume-file mapping**. `lib/resume-match.ts`
and its four fuzzy filename tiers exist only because resumes used to arrive as a flat folder
of arbitrarily named files; nothing on this path guesses. Resumes linked this way are tagged
`resume_match = 'form'`, distinct from the inferred `email|name|token|fuzzy` and from a
human's `manual` fix-up. The old sync still works for legacy/bulk folders.

`applicants.resume_file_id` is pointed at **the copy**, not the Form original — the copy lives
under `CUBE Recruiting`, which is the folder shared with the service account that streams
resumes to interviewers.

### Why writes use OAuth, not the service account

A Google **service account has no Drive storage quota and cannot own files**. Creating a
folder or copying a resume as `cube-outreach-bot@…` fails with `storageQuotaExceeded` no
matter what it has been shared on. The escapes are a Shared Drive (Workspace only) or acting
as a real user. CUBE is on a personal Gmail account, so the portal holds one refresh token for
the recruiting officer who already owns the Form, the responses and the folders.
Reads still use the service account; only writes use the token.

Two setup details that will bite if missed — both spelled out in `scripts/drive-consent.mjs`:

- Create the OAuth client in **cube-project-496921**, *not* the project behind
  `AUTH_GOOGLE_ID`. Restricted scopes attach to a project's consent screen, so adding `drive`
  there would show an "unverified app" warning to every member signing into the portal.
- Set the consent screen to **In production**. Apps left in "Testing" expire refresh tokens
  after 7 days, which would break the button weekly.

### Idempotency

Re-running is safe and only tops up — two independent mechanisms guarantee it:

1. `candidate_drive_assets` (PK `(applicant_id, kind)`) is checked before any Drive write.
2. Folder names are stable and collision-free (`lib/folder-naming.ts` appends the email, so
   two people named Jane Doe never share a folder), and `ensureFolder` looks up before
   creating — so even a lost ledger row cannot produce a duplicate folder.

A candidate whose provisioning fails halfway is reported individually and picked up on the
next run; the rest of the cohort still provisions. **Repair mode** additionally verifies each
recorded file still exists in Drive and recreates what a human deleted — one extra API call
per asset, so it is opt-in rather than the default.

### Setup

1. Run **`db/drive-folders.sql`** in the Supabase SQL editor (after `schema.sql` and
   `interview.sql`).
2. Share the Form response sheet with the service account's `client_email` as **Viewer**.
3. Create the `CUBE Recruiting` folder by hand; put its id in `RECRUITING_DRIVE_ROOT_FOLDER_ID`.
   Share it with the interviewer group — access is granted on the parent, not per candidate —
   and **not** link-public: these folders hold applicant PII.
4. `node scripts/drive-consent.mjs`, paste the refresh token into `.env`.

### Files outside this folder (interview console)

| File | Change | Why |
|---|---|---|
| `app/portal/interview/page.tsx` | **new** — shim | The console route. |
| `app/api/recruitment/interview/route.ts` | **new** — shim (GET) | Board feed. |
| `app/api/recruitment/interview/rubric/route.ts` | **new** — shim (POST) | Save a rubric. |
| `app/api/recruitment/interview/panel/route.ts` | **new** — shim (POST) | Exec sets a panel. |
| `app/api/recruitment/resumes/sync/route.ts` | **new** — shim (POST) | Exec syncs from Drive. |
| `app/api/recruitment/resume/[id]/route.ts` | **new** — shim (GET) | Streams one resume. |
| `app/portal/layout.tsx` | **+2 lines** | "Interviews" nav link for interviewer roles. |
| `proxy.ts` | **gate fixed + extended** | It matched `/portal/recruitment`, which is not a real route — so the recruiting role gate never fired. Now covers `/portal/recruiting` and `/portal/interview`. |
| `app/api/recruitment/folders/provision/route.ts` | **new** — shim (POST) | Exec provisions candidate Drive folders. |
| `scripts/drive-consent.mjs` | **new** | One-time OAuth flow to mint the Drive refresh token. |
| `.env.example` | **+ resume folder section**, **+ Drive folder section** | `RECRUITING_RESUME_FOLDER_ID`; the `RECRUITING_FORM_*` / `RECRUITING_DRIVE_*` vars. |

## Phase 2 (still scoped in SPEC.md)

Interview *scheduling* (`interview_slots`/`interviews` tables already exist — the console covers
grading, not booking), templated decision emails (reuse the bot's Gmail/service-account send),
and migrating the Join Us CTA to `/apply`.

## Remove cleanly

```bash
rm -rf features/03-recruitment-ats "app/(public)/apply" app/portal/recruiting app/api/recruitment
# remove the "Recruiting" line from app/portal/layout.tsx and the Supabase block in .env.example
# (optionally drop the tables in Supabase)
```
