# Project workspaces

`/portal/projects` is an internal workstream/deliverable board for existing
accountability project teams. It does not read or expose accountability ratings.

## Enable

Apply `db/schema.sql`, `features/05-accountability-tracker/db/schema.sql`, then
`features/10-project-workstreams/db/schema.sql`. Existing `projects` and
`project_members` rosters are reused; a matching preference is **not** a project
seat. The migration is additive/idempotent and seeds no actual tasks.

## Workflow

PMs and SCs holding those **seats on the selected project** can create
workstreams, define deliverables/success criteria, assign a current teammate,
set deadlines and edit assignments. Exec can manage every active project.
A club-wide PM/SC title without the corresponding project seat grants no access.

Every teammate can view the shared board. Members can change only their own
assigned deliverables' status and document link; they cannot change owner,
deadline or scope. Statuses: To do, In progress, Blocked, In review, Done.
The board supports My work, workstream, owner and overdue filters. Deadlines are
calendar dates and overdue uses the Central date; today's work is not late.
Archived projects remain readable but all writes are blocked.

Existing document/provider sharing rules still apply to linked deliverables.
No files are uploaded, no messages are sent, no final assignments or ratings
are changed, and no notifications are implied by changing a status.

## Access boundaries

The API rechecks membership and current role. Reads are scoped before
fetching a project's work. The service-only database function rechecks live
project seats and locks the relevant rows; an assignee and workstream must
belong to that project. Stale edit revisions conflict rather than overwriting
someone else's progress. Request bodies cannot choose an actor.

New tables have RLS with no anon/authenticated access. This uses NextAuth
sessions, not Supabase client JWTs. Missing configuration/migrations produce
an unavailable state, never a fake saved item.

## Verification

Run `npx tsc --noEmit`, targeted ESLint and `npm test -- --runInBand`.
`__tests__/project-work/schema.test.sql` is for a **disposable** test database
only after the schemas above. It checks project-seat authority, other-team
rejection, assignment scope, member-owned progress, stale edits, archived
projects and denied anonymous access. It uses fictional fixtures and rolls back.
