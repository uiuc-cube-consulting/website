-- CUBE portal — FA26 projects + rosters for the accountability tracker.
-- Run AFTER db/schema.sql, db/seed-members-fa26.sql,
-- db/seed-new-members-fa26.sql, and
-- features/05-accountability-tracker/db/schema.sql.
--
-- ⚠ db/seed-new-members-fa26.sql is on the UNMERGED branch chore/fa26-new-members
-- (commit 629b3ec). The 30 first-semester consultants seated below are already in
-- the live `members` table, so this file runs clean against production today —
-- but rebuilding a database from `main` alone seats none of them, and Check 1
-- reports all 30. Merge that branch.
--
-- Run the WHOLE file in one go (it builds a temp table that later statements read).
-- Idempotent: re-running updates dates and seats in place and adds anyone new.
-- It never deletes — removing someone from a project is a manual delete.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- BLOCK 1 (projects) and the PM/SC seats in BLOCK 2 are filled in. CONSULTANT
-- seats are in for all seven, as given on 2026-09-01 and extended on 2026-09-15.
--
-- THE 2026-09-15 INTAKE. The 30 first-semester members who accepted FA26 offers
-- take a 'consultant' seat here, in week 3 of an 11-week semester. Two of them
-- sit differently from the assignment sheet: Nico Crevier is on Wrike, not
-- Deloitte, and Anjan Adhiyaman is on Deloitte, not Wrike.
--
-- Their members.role is plain `member`, which is NOT in ACCOUNTABILITY_ROLES
-- (features/05-accountability-tracker/lib/access.ts), so none of them can open
-- /portal/accountability. That is correct and needs no change: a consultant is
-- rated in the grid, never a reader of it — canViewProject deliberately hides a
-- consultant's own ratings from them whatever their org role.
--
-- Two knock-on effects of seating them mid-semester, both expected:
--   · Weeks 1-2 go from "unrated" to "incomplete" in the exec overview.
--     weekCompletion measures every elapsed week against the CURRENT roster
--     (lib/types.ts), so these 30 retroactively widen grids nobody could have
--     filled. With only 6 ratings on record cohort-wide, those weeks read as
--     missed already — this changes the number, not the verdict.
--   · Project consultant counts jump from 2-3 to 6-9, so the Friday reminder
--     asks each PM for roughly triple the cells it did last week.
--
-- Lakshya Agarwal ("Lucky") is no longer absent: he takes the SENIOR CONSULTANT
-- seat on VerityXR as of 2026-09-15. He was in the member seed but on no project
-- all semester, which meant nobody rated him and the last check below reported
-- him on every run. His members.role stays `returning_member` — the seat is what
-- grants rating authority, the same as Krithika on VerityXR and William on
-- VoiceOS, both of whom hold SC seats under that role.
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
-- derived from it, and it is the only date the tracker needs. `weeks` caps the
-- semester so a finished project stops sending reminders; change it per project
-- if a cycle is shorter or longer.
--
-- WEEK 1 WAS DROPPED (2026-09-03). The semester originally started 2026-08-24,
-- but consultants were not seated until 2026-08-31, so that first week had
-- nobody to rate on any project — an empty column in every grid that no PM could
-- ever have filled. Rather than carry it as a permanent gap, the semester now
-- starts on the 31st and runs 11 weeks instead of 12.
--
-- The end date is unchanged either way: Aug 24 + 12 weeks and Aug 31 + 11 weeks
-- both finish the week of Nov 9-15. Only the numbering moved down by one, so what
-- the portal called Week 2 is now Week 1.
insert into projects (name, client, cohort, starts_on, weeks, active) values
  ('Deloitte',      'Deloitte',      'FA26', '2026-08-31', 11, true),
  ('Replit',        'Replit',        'FA26', '2026-08-31', 11, true),
  ('VoiceOS',       'VoiceOS',       'FA26', '2026-08-31', 11, true),
  ('Mando',         'Mando',         'FA26', '2026-08-31', 11, true),
  ('Wrike',         'Wrike',         'FA26', '2026-08-31', 11, true),
  ('SolutionExec',  'SolutionExec',  'FA26', '2026-08-31', 11, true),  -- aka "GTM Shift", same project
  ('VerityXR',      'VerityXR',      'FA26', '2026-08-31', 11, true)
on conflict (lower(name), cohort) do update
  set client    = excluded.client,
      starts_on = excluded.starts_on,
      weeks     = excluded.weeks,
      active    = excluded.active;

-- ── BLOCK 1b · Renumber the reminder ledger ──────────────────────────────────
-- Dropping week 1 shifts every week down by one, and `accountability_reminders`
-- stores the OLD number. Left alone, the 17 people emailed about "week 2" on
-- 2026-09-01 would be emailed again the moment that same week became week 1 —
-- the ledger is what makes the job at-least-once instead of every-run.
--
-- Guarded so a re-run is a no-op: it only fires while a row still sits at the old
-- numbering, which after the first run is nothing. Ratings need no such fix —
-- there were none when the week was dropped, for the same reason it was dropped.
update accountability_reminders r
   set week = r.week - 1
  from projects p
 where p.id = r.project_id
   and p.cohort = 'FA26'
   and p.starts_on = '2026-08-31'
   and r.week > 1
   and not exists (
     select 1 from accountability_reminders x
      where x.project_id = r.project_id
        and x.recipient_id = r.recipient_id
        and x.week = r.week - 1
   );

-- ── BLOCK 2 · Rosters ────────────────────────────────────────────────────────
-- Every seat below is real: PM/SC from the assignment table, consultants as given
-- on 2026-09-01. A project with zero consultants renders an empty grid and is
-- skipped entirely by the weekly reminder (getReminderTargets drops it), so an
-- accidental deletion here goes unnoticed — Check 4 is what catches it.
--
-- Emails must match `members` exactly (db/seed-members-fa26.sql). Anyone
-- misspelled is reported by Check 1 rather than silently skipped. One list, read
-- by every statement below — nothing to keep in sync by hand.

drop table if exists roster;
create temp table roster (project_name text, email text, seat text);

-- ── VerityXR ─────────────────────────────────────────────────────────────────
insert into roster values
  ('VerityXR', 'hiralp3@illinois.edu',  'project_manager'),   -- Hiral Palakurty
  ('VerityXR', 'kn35@illinois.edu',     'senior_consultant'), -- Krithika Nekkanti
  ('VerityXR', 'lakshya6@illinois.edu', 'senior_consultant'), -- Lakshya Agarwal ("Lucky")
  ('VerityXR', 'aryaar3@illinois.edu',  'consultant'),        -- Aryaa Rawat
  ('VerityXR', 'kvatsa2@illinois.edu',  'consultant'),        -- Krish Vatsa
  ('VerityXR', 'rahilts2@illinois.edu', 'consultant'),        -- Rahil Shah
  -- 2026-09-15 intake
  ('VerityXR', 'ruchar2@illinois.edu',  'consultant'),        -- Rucha Rajadhyax
  ('VerityXR', 'diyadd2@illinois.edu',  'consultant'),        -- Diya Deshpande
  ('VerityXR', 'aanya3@illinois.edu',   'consultant'),        -- Aanya Shah
  ('VerityXR', 'tvisham3@illinois.edu', 'consultant'),        -- Tvisha Mishra
  ('VerityXR', 'etran36@illinois.edu',  'consultant');        -- Elizabeth "Ellie" Tran

-- ── Deloitte ─────────────────────────────────────────────────────────────────
insert into roster values
  ('Deloitte', 'tz81@illinois.edu',     'project_manager'),   -- Tristan Zhang
  ('Deloitte', 'msgong2@illinois.edu',  'senior_consultant'), -- Michael Gong
  ('Deloitte', 'aadis2@illinois.edu',   'senior_consultant'), -- Aadi Shah
  ('Deloitte', 'ajle2@illinois.edu',    'consultant'),        -- Adrian Le
  ('Deloitte', 'dchau319@illinois.edu', 'consultant'),        -- Diya Chaudhari
  ('Deloitte', 'vivaanb2@illinois.edu', 'consultant'),        -- Vivaan Bommareddi
  -- 2026-09-15 intake
  ('Deloitte', 'nivetha5@illinois.edu', 'consultant'),        -- Nivetha Subramanian
  ('Deloitte', 'ayushk10@illinois.edu', 'consultant'),        -- Ayush Kulkarni
  ('Deloitte', 'ddey5@illinois.edu',    'consultant'),        -- Debanshi Dey
  ('Deloitte', 'anjan2@illinois.edu',   'consultant');        -- Anjan Adhiyaman (assignment sheet says Wrike)

-- ── Replit ───────────────────────────────────────────────────────────────────
insert into roster values
  ('Replit', 'chloeat2@illinois.edu', 'project_manager'),   -- Chloe Tam
  ('Replit', 'kalip3@illinois.edu',   'senior_consultant'), -- Kali Patel
  ('Replit', 'hnguy115@illinois.edu', 'consultant'),        -- Huyen Nguyen
  ('Replit', 'ripp3@illinois.edu',    'consultant'),        -- Malcom Ripp
  -- 2026-09-15 intake
  ('Replit', 'llchien2@illinois.edu', 'consultant'),        -- Leon Chien
  ('Replit', 'iwchan2@illinois.edu',  'consultant'),        -- Indalina Chan
  ('Replit', 'adarshr6@illinois.edu', 'consultant'),        -- Adarsh Rao
  ('Replit', 'carsont4@illinois.edu', 'consultant');        -- Carson Turner

-- ── Wrike ────────────────────────────────────────────────────────────────────
insert into roster values
  ('Wrike', 'batualp2@illinois.edu', 'project_manager'),   -- Batu Alp
  ('Wrike', 'aranjan6@illinois.edu', 'senior_consultant'), -- Aarushi Ranjan
  ('Wrike', 'ayaanc2@illinois.edu',  'senior_consultant'), -- Ayaan Chawla
  ('Wrike', 'sinturi2@illinois.edu', 'consultant'),        -- Satviki Inturi
  ('Wrike', 'taniyaa2@illinois.edu', 'consultant'),        -- Taniya Agrawal
  -- 2026-09-15 intake
  ('Wrike', 'aroshy2@illinois.edu',  'consultant'),        -- Ashra Roshy
  ('Wrike', 'mjkuze@illinois.edu',   'consultant'),        -- Maximilian Kuzera
  ('Wrike', 'dbollig2@illinois.edu', 'consultant'),        -- Duane Bollig
  ('Wrike', 'crevier3@illinois.edu', 'consultant');        -- Nico Crevier (assignment sheet says Deloitte)

-- ── Mando ────────────────────────────────────────────────────────────────────
insert into roster values
  ('Mando', 'advita2@illinois.edu',  'project_manager'),   -- Advit Arora
  ('Mando', 'awanj1@illinois.edu',   'senior_consultant'), -- Anushka Wanjara
  ('Mando', 'bdb6@illinois.edu',     'senior_consultant'), -- Benjamin Brown
  ('Mando', 'kkalra3@illinois.edu',  'consultant'),        -- Krish Kalra
  ('Mando', 'nikhill2@illinois.edu', 'consultant'),        -- Nikhil Lalwani
  -- 2026-09-15 intake
  ('Mando', 'adesa44@illinois.edu',  'consultant'),        -- Aadi Desai
  ('Mando', 'ilic3@illinois.edu',    'consultant'),        -- Stefan Ilic
  ('Mando', 'veerazt2@illinois.edu', 'consultant'),        -- Veeraz Thakkar
  ('Mando', 'nbj2@illinois.edu',     'consultant'),        -- Nevin Joseph
  ('Mando', 'ateuer2@illinois.edu',  'consultant');        -- Avan Teuer

-- ── VoiceOS ──────────────────────────────────────────────────────────────────
-- The assignment table lists William as "1/2" — shared or half-time. Recorded as
-- a full SC seat here: the seat only decides who may fill the grid, so a shared
-- SC and a dedicated one need the same access.
insert into roster values
  ('VoiceOS', 'nutheti2@illinois.edu', 'project_manager'),   -- Veda Nutheti
  ('VoiceOS', 'wchen236@illinois.edu', 'senior_consultant'), -- William Chen
  ('VoiceOS', 'arjunrw2@illinois.edu', 'consultant'),        -- Arjun Wadhwa
  ('VoiceOS', 'bryanz4@illinois.edu',  'consultant'),        -- Bryan Zhang
  -- 2026-09-15 intake
  ('VoiceOS', 'kl77@illinois.edu',     'consultant'),        -- Krystal Lee
  ('VoiceOS', 'angelaz9@illinois.edu', 'consultant'),        -- Angela Zhang
  ('VoiceOS', 'ndutia2@illinois.edu',  'consultant'),        -- Nikhil Dutia (not Nikhil Lalwani, on Mando)
  ('VoiceOS', 'aadid3@illinois.edu',   'consultant');        -- Aadi Dang

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
--
-- Eric Zheng held a consultant seat here and is gone: he was removed from the
-- live `members` table as inactive on 2026-09-11, and dropping his row from the
-- member seed (commit 629b3ec) without dropping it here would have left this
-- file re-adding a seat for someone Check 1 can no longer resolve.
insert into roster values
  ('SolutionExec', 'aadik3@illinois.edu',   'project_manager'),   -- Aadi Kenchammana
  ('SolutionExec', 'aaravg2@illinois.edu',  'senior_consultant'), -- Aarav Gupta
  ('SolutionExec', 'gmonago2@illinois.edu', 'consultant'),        -- Grace Monago
  -- 2026-09-15 intake
  ('SolutionExec', 'itapere2@illinois.edu', 'consultant'),        -- Isaiah Tapere
  ('SolutionExec', 'arai23@illinois.edu',   'consultant'),        -- Atiksh Rai
  ('SolutionExec', 'wblum2@illinois.edu',   'consultant'),        -- Will Blum
  ('SolutionExec', 'apm18@illinois.edu',    'consultant');        -- Andrew Malichky

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
