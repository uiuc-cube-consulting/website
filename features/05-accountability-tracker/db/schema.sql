-- ─────────────────────────────────────────────────────────────────────────────
-- CUBE portal — accountability tracker (feature 05)
-- ─────────────────────────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor AFTER db/schema.sql (this references `members`).
-- Idempotent: safe to re-run.
--
-- Replaces the per-project Google Sheet where a PM/SC dropped a Meets/Exceeds/
-- Below dropdown on each consultant every week. Three categories per consultant
-- per week, an optional note on any of them, and exec sees every project.
--
-- Like the rest of the portal, these tables are only ever touched by server code
-- holding the SERVICE ROLE key (lib/supabase/server.ts), which bypasses RLS. RLS
-- is enabled and left deny-by-default so the anon key has no direct access.

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ── Projects ─────────────────────────────────────────────────────────────────
-- One row per client engagement per cohort.
--
-- `starts_on` is the Monday of Week 1 and is what makes the tracker self-driving:
-- the current week is derived from it (lib/week.ts), so nobody has to open a
-- week by hand. `weeks` caps the semester so a stale project stops nagging.
create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  client      text,
  cohort      text not null,
  starts_on   date not null,
  weeks       int  not null default 12 check (weeks between 1 and 20),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists projects_name_cohort_idx on projects (lower(name), cohort);
create index if not exists projects_cohort_active_idx on projects (cohort, active);

-- ── Project roster ───────────────────────────────────────────────────────────
-- `seat` is the seat on THIS project, deliberately separate from members.role
-- (the org-wide role). A member whose org role is 'project_manager' may sit as a
-- plain consultant on someone else's project, and the tracker must follow the
-- seat, not the title: seat decides who FILLS the grid vs. who APPEARS in it.
--
--   project_manager | senior_consultant  → fills the grid for this project
--   consultant                           → is rated in it
create table if not exists project_members (
  project_id  uuid not null references projects(id) on delete cascade,
  member_id   uuid not null references members(id)  on delete cascade,
  seat        text not null
                check (seat in ('project_manager', 'senior_consultant', 'consultant')),
  created_at  timestamptz not null default now(),
  primary key (project_id, member_id)
);
create index if not exists project_members_member_idx on project_members (member_id);
create index if not exists project_members_seat_idx   on project_members (project_id, seat);

-- ── Ratings ──────────────────────────────────────────────────────────────────
-- One row per (project, member, week, category) — the PM and the SC share one
-- grid rather than each keeping their own, so a cell is an upsert and
-- `rated_by` records whoever last set it.
--
-- No row means "not yet rated", which is what the reminder job counts. Storing
-- an explicit 'meets' default instead would make an untouched week
-- indistinguishable from a considered one.
create table if not exists accountability_ratings (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  member_id   uuid not null references members(id)  on delete cascade,
  week        int  not null check (week between 1 and 20),
  category    text not null
                check (category in ('work_quality', 'behavior', 'initiative')),
  rating      text not null check (rating in ('below', 'meets', 'exceeds')),
  note        text,
  rated_by    uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, member_id, week, category)
);
create index if not exists ratings_project_week_idx on accountability_ratings (project_id, week);
create index if not exists ratings_member_idx       on accountability_ratings (member_id);
-- Exec's "needs attention" list reads only the Below ratings across the cohort.
create index if not exists ratings_below_idx on accountability_ratings (project_id, week)
  where rating = 'below';

-- ── Reminder ledger ──────────────────────────────────────────────────────────
-- The weekly cron is at-least-once: a retry, a redeploy, or a manual re-run must
-- not re-nag someone who was already emailed for that week. The PK makes a
-- second send for the same (project, week, recipient) a no-op insert.
create table if not exists accountability_reminders (
  project_id   uuid not null references projects(id) on delete cascade,
  week         int  not null,
  recipient_id uuid not null references members(id) on delete cascade,
  sent_at      timestamptz not null default now(),
  primary key (project_id, week, recipient_id)
);

-- ── updated_at maintenance ───────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists accountability_ratings_updated_at on accountability_ratings;
create trigger accountability_ratings_updated_at
  before update on accountability_ratings
  for each row execute function set_updated_at();

-- ── RLS: deny anon by default; the server service role bypasses RLS ──────────
alter table projects                enable row level security;
alter table project_members         enable row level security;
alter table accountability_ratings  enable row level security;
alter table accountability_reminders enable row level security;
-- (No policies for anon = no anon access. Every read/write goes through the API,
--  which enforces seat + role via NextAuth. See lib/access.ts.)
