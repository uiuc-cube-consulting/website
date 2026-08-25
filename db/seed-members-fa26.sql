-- CUBE portal — FA26 general roster seed.
-- Idempotent: safe to run repeatedly in the Supabase SQL editor.
--
-- Source of truth for the 34 non-exec members of the Fall 2026 cohort.
-- Roles map from the club's titles to the five the schema allows
-- (see db/schema.sql):
--
--     Project Manager    -> project_manager
--     Senior Consultant  -> senior_consultant
--     Consultant         -> returning_member
--
-- The last mapping is deliberate. `consultant` is not a role in the schema, and
-- everyone in this cohort is a RETURNING member, so `returning_member` is both
-- accurate and the role that grants application review and interviewing
-- (INTERVIEWER_ROLES / REVIEWER_ROLES in features/03-recruitment-ats, and the
-- recruiting gate in proxy.ts). A first-semester member would be plain `member`.
--
-- NOTE: this file does NOT contain the exec board. auth.ts refuses sign-in for
-- any email absent from `members`, so exec rows must never be deleted by a
-- roster refresh — the upsert below only ever adds or corrects these 34 people,
-- and the WHERE clause makes it impossible to demote an exec by accident.

insert into members (full_name, email, role, cohort) values
  ('Aadi Kenchammana', 'aadik3@illinois.edu', 'project_manager', 'FA26'),
  ('Aadi Shah', 'aadis2@illinois.edu', 'senior_consultant', 'FA26'),
  ('Aarav Gupta', 'aarvg2@illinois.edu', 'senior_consultant', 'FA26'),
  ('Aarushi Ranjan', 'aranjan6@illinois.edu', 'senior_consultant', 'FA26'),
  ('Adrian Le', 'ajle2@illinois.edu', 'returning_member', 'FA26'),
  ('Advit Arora', 'advita2@illinois.edu', 'project_manager', 'FA26'),
  ('Anushka Wanjara', 'awanj1@illinois.edu', 'senior_consultant', 'FA26'),
  ('Arjun Wadhwa', 'arjunrw2@illinois.edu', 'returning_member', 'FA26'),
  ('Aryaa Rawat', 'aryaar3@illinois.edu', 'returning_member', 'FA26'),
  ('Ayaan Chawla', 'ayaanc2@illinois.edu', 'senior_consultant', 'FA26'),
  ('Batu Alp', 'batualp2@illinois.edu', 'project_manager', 'FA26'),
  ('Benjamin Brown', 'bdb6@illinois.edu', 'senior_consultant', 'FA26'),
  ('Bryan Zhang', 'bryanz4@illinois.edu', 'returning_member', 'FA26'),
  ('Chloe Tam', 'chloeat2@illinois.edu', 'project_manager', 'FA26'),
  ('Diya Chaudhari', 'dchau319@illinois.edu', 'returning_member', 'FA26'),
  ('Eric Zheng', 'elzheng2@illinois.edu', 'returning_member', 'FA26'),
  ('Grace Monago', 'gmonago2@illinois.edu', 'returning_member', 'FA26'),
  ('Hiral Palakurty', 'hiralp3@illinois.edu', 'project_manager', 'FA26'),
  ('Huyen Nguyen', 'hnguy115@illinois.edu', 'returning_member', 'FA26'),
  ('Kali Patel', 'kalip3@illinois.edu', 'senior_consultant', 'FA26'),
  ('Krish Kalra', 'kkalra3@illinois.edu', 'returning_member', 'FA26'),
  ('Krish Vatsa', 'kvatsa2@illinois.edu', 'returning_member', 'FA26'),
  ('Krithika Nekkanti', 'kn35@illinois.edu', 'returning_member', 'FA26'),
  ('Lakshya Agarwal', 'lakshya6@illinois.edu', 'returning_member', 'FA26'),
  ('Malcom Ripp', 'ripp3@illinois.edu', 'returning_member', 'FA26'),
  ('Michael Gong', 'msgong2@illinois.edu', 'senior_consultant', 'FA26'),
  ('Nikhil Lalwani', 'nikhil2@illinois.edu', 'returning_member', 'FA26'),
  ('Rahil Shah', 'rahilts2@illinois.edu', 'returning_member', 'FA26'),
  ('Satviki Inturi', 'sinturi2@illinois.edu', 'returning_member', 'FA26'),
  ('Taniya Agrawal', 'taniyaa2@illinois.edu', 'returning_member', 'FA26'),
  ('Tristan Zhang', 'tz81@illinois.edu', 'project_manager', 'FA26'),
  ('Veda Nutheti', 'nutheti2@illinois.edu', 'project_manager', 'FA26'),
  ('Vivaan Bommareddi', 'vivaanb2@illinois.edu', 'returning_member', 'FA26'),
  ('William Chen', 'wchen236@illinois.edu', 'returning_member', 'FA26')
on conflict (email) do update
  set full_name = excluded.full_name,
      role      = excluded.role,
      cohort    = excluded.cohort
  -- Never let a roster refresh strip someone of exec. If an exec's email ever
  -- appears in this list by mistake, their role is left alone rather than
  -- silently downgraded, which would lock them out of /portal/admin.
  where members.role <> 'exec';

-- Verify:
--   select role, count(*) from members group by role order by role;
