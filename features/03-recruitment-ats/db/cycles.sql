-- Recruiting cycles — additive migration on top of db/schema.sql.
-- Run AFTER schema.sql and visibility.sql, once, in the Supabase SQL editor.
-- Safe to re-run.
--
-- What this changes
-- ─────────────────────────────────────────────────────────────────────────────
-- An application now belongs to a SEMESTER. Before this, `applicants` held one
-- row per person and nothing recorded when they applied beyond `created_at`,
-- which meant a candidate who was turned down in fa26 and came back in sp27
-- either overwrote their own first application or was rejected as a duplicate by
-- the import's email dedupe. Both outcomes lose a real application.
--
-- After this, identity is (person, cycle):
--   · `applicants.cycle` holds a canonical key — 'fa26', 'sp27', 'su26'
--   · unique (lower(email), cycle) — one application per person per cycle, and
--     as many cycles as they like
--
-- Everything hanging off an application (reviews, assignments, decisions,
-- interview_panel, candidate_drive_assets) keys on `applicant_id` and therefore
-- inherits the cycle for free. No score, panel or decision needs a cycle of its
-- own, and giving one to any of them would create a second source of truth that
-- could disagree with the application it belongs to.
--
-- The canonical form is enforced here as well as in lib/cycle.ts, because the
-- import path, a hand-written backfill and a future admin script can all reach
-- this column without going through the TypeScript normaliser.

-- ── 1. The cycle column ──────────────────────────────────────────────────────
-- Added nullable so the backfill below can run, then tightened to NOT NULL.
alter table applicants add column if not exists cycle text;

-- Backfill rows written before this migration from when they were created:
-- Jan–May spring, Jun–Jul summer, Aug–Dec fall.
--
-- This split is duplicated in `cycleForDate()` in lib/cycle.ts. If one changes
-- the other must change with it, or a backfilled row and a freshly-written one
-- disagree about which cohort the same week belongs to.
update applicants
   set cycle = case
                 when extract(month from created_at) between 1 and 5 then 'sp'
                 when extract(month from created_at) between 6 and 7 then 'su'
                 else 'fa'
               end || to_char(created_at, 'YY')
 where cycle is null;

alter table applicants alter column cycle set not null;

-- A safety net, not the intended path. Every insert should pass an explicit
-- cycle resolved from `recruiting_settings.active_cycle` (see lib/visibility.ts),
-- but an insert that forgets one lands in the cohort matching today's date
-- rather than failing outright mid-application-window.
alter table applicants alter column cycle set default (
  case
    when extract(month from now()) between 1 and 5 then 'sp'
    when extract(month from now()) between 6 and 7 then 'su'
    else 'fa'
  end || to_char(now(), 'YY')
);

-- Canonical form only: two-letter lowercase term + two-digit year.
alter table applicants drop constraint if exists applicants_cycle_check;
alter table applicants add constraint applicants_cycle_check
  check (cycle ~ '^(sp|su|fa)[0-9]{2}$');

-- Every dashboard, funnel and coverage query is scoped to one cycle, so this is
-- the access path for essentially all of them. The composite covers the common
-- "active applicants in the current cycle" filter without a second lookup.
create index if not exists applicants_cycle_idx       on applicants (cycle);
create index if not exists applicants_cycle_stage_idx on applicants (cycle, stage);

-- ── 2. One application per person per cycle ──────────────────────────────────
-- Case-insensitive on the email, because the same person types "Jane@illinois.edu"
-- one semester and "jane@illinois.edu" the next, and those are the same applicant.
--
-- If this fails, two rows already share an email within one cycle. Find them with:
--
--   select lower(email) as email, cycle, count(*), array_agg(id) as ids
--     from applicants
--    group by 1, 2
--   having count(*) > 1;
--
-- Merge or delete the duplicates, then re-run. The DO block below turns that
-- failure into a message that says so, instead of a bare index violation.
do $$
declare dupes int;
begin
  select count(*) into dupes
    from (select 1 from applicants group by lower(email), cycle having count(*) > 1) d;
  if dupes > 0 then
    raise exception
      'Cannot enforce one application per person per cycle: % email/cycle pair(s) appear more than once. See the diagnostic query in db/cycles.sql, resolve the duplicates, then re-run.', dupes;
  end if;
end $$;

create unique index if not exists applicants_email_cycle_key on applicants (lower(email), cycle);

-- ── 3. Which cycle recruiting is currently running ───────────────────────────
-- Lives on the existing singleton from db/visibility.sql rather than in an env
-- var, for the same reason `visible` does: it changes every semester and exec,
-- not a developer, needs to change it. Read through lib/visibility.ts.
--
-- Null means "nobody has set one", and the app falls back to the cycle matching
-- today's date — so a fresh install works before exec has touched anything.
-- Insurance in case this is run before db/visibility.sql: without the singleton
-- row the seed below silently updates nothing and exec's first save has nothing
-- to upsert onto.
insert into recruiting_settings (id, visible) values (true, true) on conflict (id) do nothing;

alter table recruiting_settings add column if not exists active_cycle text;

alter table recruiting_settings drop constraint if exists recruiting_settings_active_cycle_check;
alter table recruiting_settings add constraint recruiting_settings_active_cycle_check
  check (active_cycle is null or active_cycle ~ '^(sp|su|fa)[0-9]{2}$');

-- Seed it from the newest cycle that actually has applications, so an existing
-- install comes up pointing at the cohort it was already working on.
update recruiting_settings
   set active_cycle = (
         select a.cycle
           from applicants a
          group by a.cycle
          order by
            -- Calendar order, not alphabetical: 'fa26' < 'sp27' as text is a
            -- coincidence and 'fa26' < 'sp26' as text is simply wrong.
            (2000 + substring(a.cycle from 3 for 2)::int) desc,
            case substring(a.cycle from 1 for 2) when 'fa' then 2 when 'su' then 1 else 0 end desc
          limit 1
       )
 where active_cycle is null
   and exists (select 1 from applicants);

-- ── Self-access is enforced in application code, not here ────────────────────
-- A member must never read their own application file — see lib/self-access.ts.
-- That cannot be an RLS policy: every query in this feature runs through the
-- SERVICE ROLE, which bypasses RLS by design, and the viewer's identity comes
-- from a NextAuth session that Postgres never sees. The rule is applied in the
-- API routes on both reads and writes; RLS stays deny-by-default for anon, which
-- is what it is here for.
--
-- No RLS changes: `applicants` and `recruiting_settings` already have it enabled
-- with no anon policies (db/schema.sql, db/visibility.sql).
