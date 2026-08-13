-- Interview console — additive migration on top of db/schema.sql.
-- Run AFTER schema.sql, once, in the Supabase SQL editor. Safe to re-run.
--
-- Adds the three things the interviewer console needs:
--   1. a resume pointer on each applicant (auto-linked from a Drive folder)
--   2. a `kind` on reviews, so one applicant can carry a screen review, a case
--      rubric, and a behavioral rubric from the same reviewer without collision
--   3. interview_panel — who is interviewing whom. This is the authorization key:
--      an interviewer may write case/behavioral rubrics ONLY for applicants they
--      are on the panel for.

-- ── 1. Resume pointer ────────────────────────────────────────────────────────
-- We store the Drive file id, not the bytes. The file is streamed on demand by
-- /api/recruitment/resume/[id] using the service account, so resumes are never
-- shared to individual Google accounts and never become a public link.
alter table applicants add column if not exists resume_file_id   text;
alter table applicants add column if not exists resume_name      text;         -- original filename, for the fix-up UI
alter table applicants add column if not exists resume_mime      text;
alter table applicants add column if not exists resume_linked_at timestamptz;
alter table applicants add column if not exists resume_match     text;         -- email|name|token|fuzzy|manual — how it was matched

create index if not exists applicants_resume_idx on applicants (resume_file_id);
-- Search by name is the console's primary access path.
create index if not exists applicants_name_idx on applicants (lower(name));

-- ── 2. Review kinds ──────────────────────────────────────────────────────────
-- 'screen' = the existing application-review rubric (lib/types.ts RUBRIC).
-- 'case' / 'behavioral' = the two interview rubrics (lib/interview.ts).
-- Existing rows predate interviews, so they are all screens.
alter table reviews add column if not exists kind text not null default 'screen';
alter table reviews drop constraint if exists reviews_kind_check;
alter table reviews add constraint reviews_kind_check check (kind in ('screen', 'case', 'behavioral'));

-- Interviewers want a bottom line, not just criterion scores.
alter table reviews add column if not exists recommendation text;
alter table reviews drop constraint if exists reviews_recommendation_check;
alter table reviews add constraint reviews_recommendation_check
  check (recommendation is null or recommendation in ('strong_yes', 'yes', 'no', 'strong_no'));

-- Widen the uniqueness key from (applicant, reviewer) to (applicant, reviewer, kind).
-- The old constraint would otherwise let a reviewer's case rubric overwrite their screen.
-- Postgres names a table-level `unique (a, b)` as <table>_<a>_<b>_key.
alter table reviews drop constraint if exists reviews_applicant_id_reviewer_email_key;
do $$
begin
  alter table reviews add constraint reviews_applicant_reviewer_kind_key
    unique (applicant_id, reviewer_email, kind);
exception
  when duplicate_table then null;  -- constraint already present
  when duplicate_object then null;
end $$;

create index if not exists reviews_kind_idx on reviews (kind);

-- ── 3. Interview panels ──────────────────────────────────────────────────────
-- Exec assigns the interviewer(s) who will actually be in the room. Distinct from
-- `assignments` (random, evenly-spread application readers) because an interview
-- pairing is scheduled by a human, not drawn from a hat.
create table if not exists interview_panel (
  applicant_id      uuid not null references applicants(id) on delete cascade,
  interviewer_email text not null,
  assigned_at       timestamptz not null default now(),
  assigned_by       text,
  primary key (applicant_id, interviewer_email)
);
create index if not exists interview_panel_interviewer_idx on interview_panel (lower(interviewer_email));

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same posture as the rest of the ATS: deny-by-default for anon, service role
-- (server-only) bypasses. All access goes through the API, which enforces both
-- NextAuth session and panel membership.
alter table interview_panel enable row level security;
