-- Alumni directory (feature 07).
-- Run once in the Supabase SQL editor, after db/schema.sql. Safe to re-run.
--
-- Every CUBE alum we know of: who they are, where they are now, and how to
-- reach them, so a member can find someone to ask about a company, a major or
-- a recruiting season. Read by every signed-in member at /portal/alumni;
-- written only by exec through /api/alumni.
--
-- The rows themselves are NOT in this repo. The repo is public and these are
-- real people's names, personal emails and phone numbers, so the data lives in
-- Supabase only and is loaded from a local, gitignored file by
-- features/07-alumni-directory/scripts/import-alumni.mjs.

create table if not exists alumni (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  full_name       text not null,

  -- The import's identity key: re-running it skips anyone whose profile is
  -- already here, so it can never overwrite an exec's edit. Nullable because
  -- an alum added by hand may not have a profile on file; Postgres lets any
  -- number of nulls through a unique constraint.
  linkedin_url    text unique,

  -- What their LinkedIn profile says today ("SWE @ Cisco | CS + Econ @ UIUC").
  -- Fresher than company/position, which mostly came from the alumni sheet.
  headline        text,
  company         text,
  position        text,
  major           text,

  -- Only the alumni who gave these to CUBE have them, mostly the mentors.
  email           text,
  phone           text,

  -- "On campus" means still a UIUC student (left CUBE or finished their
  -- semesters but not graduated), so a member can grab coffee with them.
  -- 'unknown' is honest: the sheet's own checkbox was almost never filled in.
  campus_status   text not null default 'unknown'
                    check (campus_status in ('on_campus', 'off_campus', 'unknown')),
  open_to_mentor  boolean not null default false,

  -- Where the row came from, so exec know which rows are LinkedIn guesses.
  source          text not null default 'manual'
                    check (source in ('sheet', 'linkedin', 'sheet+linkedin', 'manual')),

  -- Last exec to edit the row. `set null` so an exec graduating out of
  -- `members` doesn't take the alumni rows they touched with them.
  updated_by      uuid references members(id) on delete set null
);

create index if not exists alumni_name_idx on alumni (lower(full_name));

-- Reads and writes go through the service-role key in the server, which
-- bypasses RLS. RLS is still enabled with no policies so the anon key, which
-- ships to every browser, can't read anyone's phone number straight out of
-- PostgREST.
alter table alumni enable row level security;
