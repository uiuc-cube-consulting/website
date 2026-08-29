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

## Permissions

Authorization lives in **`lib/access.ts`** — one set of predicates, imported by
every route and by the UI so the interface never offers an action the API refuses.

| Surface | exec | PM | Senior Consultant | returning_member | member |
|---|:--:|:--:|:--:|:--:|:--:|
| Read applicant pool (`GET /applicants`) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Submit screen review (`POST /reviews`) | ✅ | assigned | assigned | assigned | ❌ |
| Interview board / rubric / resume | ✅ | ✅ | ✅ | ✅ | ❌ |
| Write case + behavioral rubric | ✅ | on panel | on panel | on panel | ❌ |
| Change applicant stage (`POST /decisions`) | ✅ | ❌ | ❌ | ❌ | ❌ |
| Import, assign, set panel, sync, provision | ✅ | ❌ | ❌ | ❌ | ❌ |

**The rule:** `proxy.ts` gating is a redirect, not a boundary. Anyone can call an
API route directly, so every route re-checks the role itself. Three routes did not,
and were fixed:

- `GET /applicants` checked only "is signed in", so a plain `member` — redirected
  away from `/portal/recruiting` — could still read every candidate's name, email
  and essay answers straight from the API.
- `POST /reviews` had the same hole, and `REVIEWER_ROLES` in `store.ts` was used
  only to *list* the reviewer pool, never to gate a write. It now also enforces
  **assignment**, so the random even spread from `planAssignments` is a real
  constraint rather than a suggestion — matching how the interview rubric has
  always enforced panel membership.
- `POST /decisions` let any signed-in member advance or reject a candidate. Now
  exec-only, and the UI buttons are hidden accordingly.

A fourth, in feature 02: `isExec()` in `features/02-pipeline-crm/lib/pipeline.ts`
ended with `return true` for a session carrying no role. Since `.env.example`
instructs you to leave `PIPELINE_EXEC_ALLOWLIST` blank, and the `jwt` callback
loads the role only on sign-in (skipping it if the members lookup errors), that
handed the whole client pipeline to any signed-in member. It now fails closed.

`__tests__/recruitment/permissions*.test.ts` drives every route once per role and
asserts both halves — who gets in, and who is refused before any side effect runs.

## Candidate Drive folders (built)

Recruiting intake runs through a Google Form whose responses land in a sheet, with each
resume arriving as a **Drive link**. Exec hits **Provision candidate folders** on
`/portal/interview`, and every candidate **currently in the first round** gets:

```
CUBE Recruiting/                     ← RECRUITING_DRIVE_ROOT_FOLDER_ID, made by hand once
└── Fall 2026/                       ← cycleLabel(active cycle), NOT an env var
    └── Jane Doe — jdoe2@illinois.edu/
        ├── Resume — Jane Doe.pdf        copy of the Form upload
        ├── Case Rubric — Jane Doe       generated Google Doc
        ├── Behavioral Rubric — Jane Doe generated Google Doc
        └── Interview Notes — Jane Doe   blank, for the panel to type into live
```

Two things about that run are worth stating plainly, because both changed:

- **First round only.** Folders are provisioned for candidates whose stage puts them in the
  first round, not for every respondent. A folder holds the two rubric docs, and those mean
  nothing until somebody is actually being interviewed — provisioning the whole written pool
  would be hundreds of folders nobody opens, at ~5 Drive calls each. Re-run it after each
  batch of advancement decisions and it picks up exactly the people who just moved. The
  result reports `notInRound` for everyone skipped; that is information, not an error.
- **The cycle folder follows the active cycle**, via `cycleLabel(await getActiveCycle())`, not
  `RECRUITING_CYCLE_LABEL`. The env var remains only as a manual override through
  `opts.cycle`. Deriving it removes a quiet, nasty failure: opening a new cycle in the portal
  without redeploying used to file every new candidate under last cycle's folder — and because
  `candidateFolderName` is stable across cycles by design, a returning applicant's folder
  would resolve to their OLD one and the new resume and rubric docs would land on top of it.

### Why the Form changes the resume story

The Form gives an **authoritative candidate → resume-file mapping**. `lib/resume-match.ts`
and its four fuzzy filename tiers exist only because resumes used to arrive as a flat folder
of arbitrarily named files; nothing on this path guesses. Resumes linked this way are tagged
`resume_match = 'form'`, distinct from the inferred `email|name|token|fuzzy` and from a
human's `manual` fix-up. The old sync still works for legacy/bulk folders.

`applicants.resume_file_id` is pointed at **the copy**, not the Form original — the copy lives
under `CUBE Recruiting`, which is the folder shared with the service account that streams
resumes to interviewers.

### Why the destination must be a shared drive

A Google **service account has no Drive storage quota and cannot own files**. Creating a folder
or copying a resume into a person's My Drive fails with `storageQuotaExceeded` no matter what
the account has been shared on.

A **shared drive** owns its own contents, so files created there have no individual owner and
the service account never needs quota. That also makes the recruiting tree org-owned rather
than tied to whichever officer set it up — nothing to transfer when they graduate.

Add the service account's `client_email` to the shared drive as **Content Manager**.
Viewer/Commenter/Contributor cannot create folders. Every Drive call in `lib/drive-write.ts`
passes `supportsAllDrives` — omit it and the API reports a shared-drive file as a bare 404
rather than a permission error, which is a genuinely confusing way to fail.

Reads and writes both use `GOOGLE_SERVICE_ACCOUNT_JSON`; there is no second credential and no
user token to keep alive.

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
2. Create a **shared drive** named `CUBE Recruiting` and put its id in
   `RECRUITING_DRIVE_ROOT_FOLDER_ID`. Add two members, and no more:
   - the service account's `client_email` as **Content Manager** — it needs create rights, and
     it is also what streams resumes back to the portal, since `applicants.resume_file_id`
     points at the *copy* inside this drive;
   - the interviewer group as **Viewer** or **Commenter** — access is granted on the drive, not
     per candidate.

   Do **not** share it link-public: these folders hold applicant PII.
3. Share the Form's **response sheet** with the same `client_email` as **Viewer**.
4. Share the Form's **`… (File responses)` folder** with the same `client_email` as **Viewer**.

Step 4 is required, not optional: the service account performs the copy itself, so it needs
read access to the source. (Under a user-token design the officer would already own both sides
and this step would not exist — it is a direct consequence of using the service account.) That
folder is only ever read; resumes are copied out of it, never moved, so the response sheet's
links keep working and the Form's own records are untouched.

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
| `.env.example` | **+ resume folder section**, **+ Drive folder section** | `RECRUITING_RESUME_FOLDER_ID`; the `RECRUITING_FORM_*` / `RECRUITING_DRIVE_*` vars. |

## Three rounds (built)

The cycle runs in three explicitly separated rounds. A round is **derived from the
applicant's stage** (`lib/rounds.ts`) rather than stored beside it, so the two can never
disagree — moving a candidate between rounds is the one stage write exec already makes.

| Round | Stages | Where | Who | Scored on |
|---|---|---|---|---|
| **Written applications** | `applied`, `screened` | `/portal/recruiting` | every member may read + flag; recruiting roles score | the 28-point rubric in `lib/types.ts` |
| **First round** | `interview` | `/portal/interview` → First round | exec, PM, SC, returning members — on the panel | case + behavioral, 1–5 (`lib/interview.ts`) |
| **Final round** | `final_round` | `/portal/interview` → Final round | **exec only** | the same two rubrics, stored as `final_case` / `final_behavioral` |

`offer`, `accepted`, `rejected` and `withdrawn` belong to **no** round — there is no work
left to do on them, and treating them as one would put them back on somebody's board.

Run **`db/rounds.sql`** (after `schema.sql` and `interview.sql`). It widens the `reviews.kind`
check to the two final-round kinds, adds `round` to `interview_panel` and repoints its primary
key at `(applicant_id, interviewer_email, round)`, and documents the new `final_round` stage.

### The written rubric is points, not a 1–5 mean

`RUBRIC` in `lib/types.ts` is six criteria, each with **its own ceiling**, summing to 28:

| Criterion | Points |
|---|---|
| Essay 1 | 0–5 |
| Essay 2 | 0–3 |
| Essay 3 | 0–3 |
| Case essay | 0–7 |
| Miscellaneous | 0–5 |
| Resume | 0–5 |

Three consequences worth knowing:

- **Zero is a real score**, meaning an unanswered or worthless answer — not "unscored". So
  completeness is a presence check (`isScreenComplete`), never `> 0`, and `isValidScore`
  refuses to coerce: `Number(null)` is 0, and a coercing check would let an untouched
  criterion submit as a harsh zero. Aggregates count zeros for the same reason — dropping
  them would flatter exactly the applications that left the most blank.
- **`reviews.weighted_total` keeps its column name but holds points** for `screen` rows. Only
  the interview rubrics still put a 1–5 weighted mean in it. Totals are recomputed from
  `scores` on read, so a row written under an older rubric cannot skew a mean.
- **The disagreement threshold is 7 points** (a quarter of the scale), derived from
  `SCREEN_MAX_POINTS` so a rubric change moves it rather than leaving a stale constant.

Reviews written under the OLD four-criterion rubric are left in place and score 0 under the
new one. `db/rounds.sql` carries the (deliberately not executed) cleanup statement.

### The resume is visible during the written round

The rubric scores the resume out of 5, so `importApplicants` now links each applicant to the
Drive file their Form response uploaded (`linkFormResumes`, `resume_match = 'form'`), and the
written console shows it inline. Waiting for first-round provisioning would mean nobody could
see a resume until after the decision that needs it. First-round provisioning still copies the
file into the candidate's folder and repoints them at the copy — that copy lives in the shared
drive the service account owns, so it survives the applicant tidying up their own Drive.

### How the final round stays exec-only

Not by hiding a tab. `GET /api/recruitment/interview?round=final_round` refuses a non-exec
**before** `getBoard` runs, so no final-round score is read out of the database for them; the
board's three queries are each scoped to the round, so another round's rubrics are never
fetched into a response rather than merely filtered out of one; `interview/rubric` derives the
round from the submitted `kind` (the client never sends a round, so the two cannot be made to
disagree) and re-checks; the panel picker is narrowed to who may interview in that round, and
`interview/panel` intersects the submitted list with the same rule; and
`GET /api/recruitment/applicants` omits `final_round`-stage applicants entirely for everyone
but exec, so the roster itself does not leak who is still in it.

## Red & green flags (any time, on anyone)

A flag is about a **person, keyed by email** — not about an application row. Members flag
people at info nights, callouts and coffee chats, weeks before the application opens and
while the recruiting console is closed. A flag filed that way is stored **pending**
(`applicant_id` null) and is **claimed automatically** the first time an application arrives
from that address, carrying its original author, note, event and date onto the candidate's
profile.

**Migration:** re-run `db/flags.sql` in the Supabase SQL editor. It is additive and safe to
re-run: it adds `subject_email` / `subject_name` / `event` / `linked_at`, backfills existing
rows from `applicants`, makes `applicant_id` nullable, and switches the applicant foreign key
from `ON DELETE CASCADE` to `ON DELETE SET NULL` — a deleted application no longer destroys
the observation somebody made at an event; the flag reverts to pending instead.

| Where | What |
|---|---|
| `/portal/flags` | Standalone intake: colour, their email, optional name + event, note. Lists the pending pool. |
| `/portal/recruiting` → candidate | Unchanged flag panel, now showing the event and a **"Before applying"** badge on claimed flags. |
| `POST /api/recruitment/flags` | Takes **either** `applicant_id` (as before) **or** `subject_email` + optional `subject_name` / `event`. |
| `GET /api/recruitment/flags` | The pending pool — flags still waiting on an application. |

### Two deliberate decisions

**`/portal/flags` is not behind the recruiting visibility toggle.** The console is
cycle-scoped and shut between cycles; flags are not, and the most valuable ones are filed
during exactly that window. Gating them on `canViewRecruiting` would switch the feature off
for the period it exists to serve. The gate still applies to anything that reads applicant
data: flagging by `applicant_id` is refused while recruiting is closed, and the response
withholds whether the email is already in the pipeline.

**You never see or file flags about yourself.** The pending pool is the one surface where a
flag is visible without going through an applicant row, so `GET /api/recruitment/flags` drops
any flag whose `subject_email` is the viewer's, and the POST refuses a flag on your own email
or on an applicant id that resolves to one of your own applications. Redaction is by
**subject**, not submitter — your own filings about other people stay visible — and there is
no exec bypass, for the reasons in `lib/self-access.ts`.

**Claiming happens on every path that creates an applicant** — the public form
(`createApplicant`) and the bulk sheet import (`importApplicants`, which now reports
`flagsLinked`). Most applicants arrive through the import, so claiming only on the form
would strand event flags for nearly the whole cohort.

### Files outside this folder (flags)

| File | Change | Why |
|---|---|---|
| `app/portal/flags/page.tsx` | **new** — shim | Year-round flag intake route. |
| `app/api/recruitment/flags/route.ts` | **+GET** | Pending pool feed; POST already shimmed. |
| `app/portal/layout.tsx` | **+1 line** in `<nav>` | "Flags" link, shown to every member regardless of the recruiting toggle. |

## Recruiting cycles — applying more than once (built)

People apply to CUBE more than once. Someone turned down in fa26 comes back in sp27, and
both attempts are real applications with their own essays, reviewers and scores. Before this,
`applicants` held one row per person: the sheet import deduped on email alone, so a returning
candidate was matched against their old row and dropped as a duplicate — reported under
`skipped`, indistinguishable from a genuine double submission, and nobody found out.

An application now belongs to a **semester**, and identity is `(person, cycle)`:

- `applicants.cycle` holds a canonical key — `fa26`, `sp27`, `su26`
- `unique (lower(email), cycle)` — one application per person per cycle, as many cycles as
  they apply in

Everything hanging off an application (reviews, assignments, decisions, `interview_panel`,
`candidate_drive_assets`) keys on `applicant_id` and inherits the cycle for free. None of them
gets a cycle of its own — that would be a second source of truth that could disagree with the
application it belongs to.

**`stage` and `cycle` are orthogonal** and easy to confuse: stage is how far someone got
*within* one cycle, cycle is *which attempt* it was. Marcus rejected in sp26 and screening in
fa26 is two rows, each with its own stage.

### Setup

Run **`db/cycles.sql`** in the Supabase SQL editor (after `schema.sql` and `visibility.sql`).
It backfills existing rows from `created_at` (Jan–May spring, Jun–Jul summer, Aug–Dec fall),
adds the uniqueness index, and seeds `recruiting_settings.active_cycle` from the newest cycle
that has applications. If two rows already share an email within one cycle it stops with a
message naming the count and a diagnostic query, rather than a bare index violation.

### The active cycle

Which cycle recruiting is *running* lives on the existing `recruiting_settings` singleton, next
to the visibility toggle and for the same reason: it changes every semester and **exec, not a
developer, changes it**. `GET/POST /api/recruitment/visibility` reads and writes both; POST
takes `visible`, `cycle`, or both, and writes the cycle first so a failed cycle write can never
leave recruiting open on the *previous* cohort.

`getActiveCycle()` never returns null — it falls back to the cycle matching today's date. An
application must always land in some cohort, and refusing one because exec hadn't clicked a
button would close intake at exactly the wrong moment. The database applies the same
date-derived default if an insert somehow arrives without one.

`lib/cycle.ts` is pure and holds the format: `normalizeCycle` collapses `"FA26"`, `"Fall 2026"`,
`"fa2026"` onto the single key `fa26`, so one cohort can't fragment across three spellings.
**Never sort cycles as text** — `"fa26" < "sp26"` alphabetically, which puts Fall 2026 before
Spring 2026. Use `compareCycles`.

### Scoped reads

`getSnapshot(cycle)`, `getCoverage(cycle)` and `assignReviewers(…, { cycle })` all narrow to one
cohort. This isn't a display preference: a funnel counting fa26 and sp27 together, or a mean
spanning two different applications from the same person, is a number that describes nothing.
Unscoped, reviewers would also be dealt last semester's cohort alongside this one — hundreds of
reads on applications decided months ago, and a coverage report that can never reach done.

`GET /applicants`, `GET /decisions` and `GET /coverage` default to the active cycle and accept
`?cycle=fa26` to open a past cohort — the point of storing a cycle per application rather than
clearing the table each semester. An unparseable value falls back to the active cycle rather than
erroring, so a stale bookmark shows the current pool instead of a 400. `GET /applicants` also
returns `cycle`, `cycleLabel` and `cycles` (every cohort that has applications, newest first,
from `listCycles()`), so the console can name the cohort it is showing and offer the others.
`POST /import` and `POST /assign` take a `cycle` in the body on the same terms.

Pending flags are deliberately **not** cycle-scoped: they're filed against an email before any
application exists, so they belong to no cohort until one claims them.

## You never see your own application (built)

Almost everyone in CUBE applied to CUBE. They were scored on the rubric by two reviewers who
didn't know each other's marks, someone filed a flag on them after an info night, and exec wrote
a note next to the decision. All of it is still in the database, keyed by the same email they
now sign in with as a member.

Recruiting reads are club-wide by design — `canAccessRecruiting` admits every member role,
because transparency about the pipeline is the point. That baseline is correct for other
people's applications and catastrophic for your own: without this, a member elected to exec in
fa26 can open `/portal/recruiting`, find themselves in the fa26 cohort, and read the scores two
of their now-teammates gave them, the spread between those two, and what was flagged about them
at a callout.

**The rule: you never see, score, or decide on your own application.** `lib/self-access.ts` holds
the pure predicates, `lib/self-access-store.ts` the one indexed lookup that write routes need
(they arrive carrying only an `applicant_id`, with no email to compare against the session).

Three properties are deliberate:

- **No exec bypass.** Every other gate in `lib/access.ts` lets exec through so a stuck queue can
  be unblocked. There's nothing to unblock here — the point is to withhold information from one
  specific person, and that person being exec makes the leak worse, not more legitimate. The
  predicates take no role argument at all, which is what makes the bypass impossible rather than
  merely absent.
- **Every cycle, not just closed ones.** A member applying again while holding a role must not
  watch their own live application being scored.
- **Reads and writes alike.** Hiding the row from the dashboard while letting the same person
  POST a review of it, set their own stage, or stream their own resume would leave the
  interesting half open.

Matching is by **email**, because that's what the two records actually share: an application row
carries no member id, and names collide.

### Where it is enforced

| Surface | What it does |
|---|---|
| `GET /applicants` | Drops your rows before coverage, aggregates and your queue are derived |
| `GET /decisions` | Drops your rows from the UNBLINDED queue (both verdicts + both sets of notes) |
| `POST /decisions` | Refuses setting a stage on your own application |
| `POST /reviews` | Refuses scoring your own application, ahead of the assignment check |
| `POST /interview/rubric` | Refuses scoring your own interview, ahead of the round gate |
| `getBoard()` | Omits your candidacy, so resume/panel/rubric state go with the row |
| `GET /resume/[id]` | 403 before any Drive traffic — an id can be guessed |
| `GET /coverage` | Drops your row; summary counted after, so it matches what you can act on |
| `GET /flags` | Withholds pending flags whose SUBJECT is you |
| `POST /flags` | Refuses flagging yourself, by email or by your own applicant id |
| `POST /assign/manual` | Refuses rerouting reviewers on your own application |

The funnel on `GET /applicants` deliberately counts the **full** cohort, including your own
application. That is the one place the rule does not apply, and it is a considered exception: a
funnel is a reporting number and should be right — "5 reached offer" says nothing about whether
you are one of them — whereas coverage is a to-do list and has to match the rows you can act on.

### Why this can't be RLS

Every query in this feature runs through the **service role**, which bypasses RLS by design, and
the viewer's identity comes from a NextAuth session that Postgres never sees. So the rule is
applied in the API routes on both reads and writes. RLS stays deny-by-default for anon, which is
what it's there for.

## Phase 2 (still scoped in SPEC.md)

Interview *scheduling* (`interview_slots`/`interviews` tables already exist — the console covers
grading, not booking), templated decision emails (reuse the bot's Gmail/service-account send),
and migrating the Join Us CTA to `/apply`.

## Remove cleanly

```bash
rm -rf features/03-recruitment-ats "app/(public)/apply" app/portal/recruiting app/portal/flags app/api/recruitment
# remove the "Recruiting" and "Flags" lines from app/portal/layout.tsx and the Supabase block in .env.example
# (optionally drop the tables in Supabase)
```
