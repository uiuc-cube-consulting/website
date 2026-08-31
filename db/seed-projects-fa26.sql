-- CUBE portal — FA26 projects + rosters for the accountability tracker.
-- Run AFTER db/schema.sql, db/seed-members-fa26.sql, and
-- features/05-accountability-tracker/db/schema.sql.
--
-- Run the WHOLE file in one go (it builds a temp table that later statements read).
-- Idempotent: re-running updates dates and seats in place and adds anyone new.
-- It never deletes — removing someone from a project is a manual delete.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 1 (projects) and the PM/SC seats in BLOCK 2 are filled in. CONSULTANT
-- seats are known for Replit only — add the rest to BLOCK 2 and re-run.
--
-- Safe to run right now: a project with no consultants comes up as an empty grid
-- and the reminder job skips it until someone is there to be rated.
--
-- Seats, which are per project and independent of members.role:
--   'project_manager' / 'senior_consultant' → fill in the weekly grid
--   'consultant'                            → appear in it, and are rated
--
-- A member whose org role is 'project_manager' but who sits as a consultant on
-- another team gets seat 'consultant' there, and is rated like anyone else.
-- Equally, an SC may hold the 'project_manager' SEAT on a project — useful here,
-- since the roster has 6 members with the PM role and 7 projects.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── BLOCK 1 · Projects ───────────────────────────────────────────────────────
-- starts_on MUST be the Monday of Week 1 — every "Week N" in the portal is
-- derived from it, and it is the only date the tracker needs. 2026-08-24 is a
-- Monday. `weeks` caps the semester so a finished project stops sending
-- reminders; change it per project if a cycle is shorter or longer.
insert into projects (name, client, cohort, starts_on, weeks, active) values
  ('Deloitte',      'Deloitte',      'FA26', '2026-08-24', 12, true),
  ('Replit',        'Replit',        'FA26', '2026-08-24', 12, true),
  ('VoiceOS',       'VoiceOS',       'FA26', '2026-08-24', 12, true),
  ('Mando',         'Mando',         'FA26', '2026-08-24', 12, true),
  ('Wrike',         'Wrike',         'FA26', '2026-08-24', 12, true),
  ('SolutionExec',  'SolutionExec',  'FA26', '2026-08-24', 12, true),  -- aka "GTM Shift", same project
  ('VerityXR',      'VerityXR',      'FA26', '2026-08-24', 12, true)
on conflict (lower(name), cohort) do update
  set client    = excluded.client,
      starts_on = excluded.starts_on,
      weeks     = excluded.weeks,
      active    = excluded.active;

-- ── BLOCK 2 · Rosters ────────────────────────────────────────────────────────
-- PM/SC seats are filled in from the assignment table. CONSULTANT seats are in
-- for Replit; the other six are still unknown — add them below and re-run.
--
-- Until a project has consultants, its grid renders with no rows to rate and the
-- weekly reminder skips it (nothing to chase). Nothing breaks.
--
-- Emails must match `members` exactly (db/seed-members-fa26.sql). Anyone
-- misspelled is reported by Check 1 rather than silently skipped. One list, read
-- by every statement below — nothing to keep in sync by hand.

drop table if exists roster;
create temp table roster (project_name text, email text, seat text);

-- ── VerityXR ─────────────────────────────────────────────────────────────────
insert into roster values
  ('VerityXR', 'hiralp3@illinois.edu', 'project_manager'),   -- Hiral Palakurty
  ('VerityXR', 'kn35@illinois.edu',    'senior_consultant'); -- Krithika Nekkanti
-- ('VerityXR', 'consultant@illinois.edu', 'consultant'),

-- ── Deloitte ─────────────────────────────────────────────────────────────────
insert into roster values
  ('Deloitte', 'tz81@illinois.edu',    'project_manager'),   -- Tristan Zhang
  ('Deloitte', 'msgong2@illinois.edu', 'senior_consultant'), -- Michael Gong
  ('Deloitte', 'aadis2@illinois.edu',  'senior_consultant'); -- Aadi Shah
-- ('Deloitte', 'consultant@illinois.edu', 'consultant'),

-- ── Replit ───────────────────────────────────────────────────────────────────
insert into roster values
  ('Replit', 'chloeat2@illinois.edu', 'project_manager'),   -- Chloe Tam
  ('Replit', 'kalip3@illinois.edu',   'senior_consultant'), -- Kali Patel
  ('Replit', 'hnguy115@illinois.edu', 'consultant'),        -- Huyen Nguyen
  ('Replit', 'ripp3@illinois.edu',    'consultant');        -- Malcom Ripp

-- ── Wrike ────────────────────────────────────────────────────────────────────
insert into roster values
  ('Wrike', 'batualp2@illinois.edu', 'project_manager'),   -- Batu Alp
  ('Wrike', 'aranjan6@illinois.edu', 'senior_consultant'), -- Aarushi Ranjan
  ('Wrike', 'ayaanc2@illinois.edu',  'senior_consultant'); -- Ayaan Chawla
-- ('Wrike', 'consultant@illinois.edu', 'consultant'),

-- ── Mando ────────────────────────────────────────────────────────────────────
insert into roster values
  ('Mando', 'advita2@illinois.edu', 'project_manager'),   -- Advit Arora
  ('Mando', 'awanj1@illinois.edu',  'senior_consultant'), -- Anushka Wanjara
  ('Mando', 'bdb6@illinois.edu',    'senior_consultant'); -- Benjamin Brown
-- ('Mando', 'consultant@illinois.edu', 'consultant'),

-- ── VoiceOS ──────────────────────────────────────────────────────────────────
-- The assignment table lists William as "1/2" — shared or half-time. Recorded as
-- a full SC seat here: the seat only decides who may fill the grid, so a shared
-- SC and a dedicated one need the same access.
insert into roster values
  ('VoiceOS', 'nutheti2@illinois.edu', 'project_manager'),   -- Veda Nutheti
  ('VoiceOS', 'wchen236@illinois.edu', 'senior_consultant'); -- William Chen
-- ('VoiceOS', 'consultant@illinois.edu', 'consultant'),

-- ── SolutionExec ─────────────────────────────────────────────────────────────
-- Also called "GTM Shift" — one project, two names. SolutionExec is the one the
-- portal uses, matching the other six, which are all named for the client org
-- rather than the engagement. Do NOT add GTM Shift as a second project: two rows
-- would split one team's ratings across two grids, and the reminder job would
-- nag the same PM twice a week.
--
-- Aadi Kenchammana ("Aadi K" in the table) is a different person from Aadi Shah,
-- who is SC on Deloitte. Both are in db/seed-members-fa26.sql — run that file
-- first, or this project's PM row is skipped by Check 1.
insert into roster values
  ('SolutionExec', 'aadik3@illinois.edu', 'project_manager'),   -- Aadi Kenchammana
  ('SolutionExec', 'aaravg2@illinois.edu', 'senior_consultant'); -- Aarav Gupta
-- ('SolutionExec', 'consultant@illinois.edu', 'consultant'),

-- ── Apply the roster ─────────────────────────────────────────────────────────
insert into project_members (project_id, member_id, seat)
select p.id, m.id, r.seat
from roster r
join projects p on lower(p.name) = lower(r.project_name) and p.cohort = 'FA26'
join members  m on m.email = lower(r.email)
on conflict (project_id, member_id) do update set seat = excluded.seat;

-- ── Check 1 · emails not found in `members` ──────────────────────────────────
-- Should return zero rows. A hit is a typo, or someone missing from the member
-- seed — they were NOT added to the project.
select r.email as missing_from_members, r.project_name
from roster r
left join members m on m.email = lower(r.email)
where m.id is null;

-- ── Check 2 · project names that don't match BLOCK 1 ─────────────────────────
select distinct r.project_name as unknown_project
from roster r
left join projects p on lower(p.name) = lower(r.project_name) and p.cohort = 'FA26'
where p.id is null;

-- ── Check 3 · projects nobody can fill the grid for ──────────────────────────
-- Every active project needs at least one PM or SC seat, or its grid is
-- unreachable and the weekly reminder has no one to email.
select p.name as project_without_a_rater
from projects p
where p.cohort = 'FA26' and p.active
  and not exists (
    select 1 from project_members pm
    where pm.project_id = p.id
      and pm.seat in ('project_manager', 'senior_consultant')
  );

-- ── Check 4 · roster coverage ────────────────────────────────────────────────
-- What each project ended up with. A project with 0 consultants shows an empty
-- grid; a member on no project is never rated.
select p.name as project,
       count(*) filter (where pm.seat = 'project_manager')   as pms,
       count(*) filter (where pm.seat = 'senior_consultant') as scs,
       count(*) filter (where pm.seat = 'consultant')        as consultants
from projects p
left join project_members pm on pm.project_id = p.id
where p.cohort = 'FA26' and p.active
group by p.name
order by p.name;

-- Members not placed on any project (excluding exec, who hold no seats).
select m.full_name, m.role
from members m
where m.cohort = 'FA26' and m.role <> 'exec'
  and not exists (select 1 from project_members pm where pm.member_id = m.id)
order by m.role, m.full_name;
