-- Per-candidate Drive folders — additive migration on top of db/interview.sql.
-- Run AFTER schema.sql and interview.sql, once, in the Supabase SQL editor.
-- Safe to re-run.
--
-- Context: resumes now arrive through a Google Form as a Drive link, and each
-- candidate gets a provisioned Drive folder holding the resume plus generated
-- case/behavioral rubric docs and a shared notes doc. Supabase stays the system
-- of record for scores, stages and panels; Drive is a parallel working surface
-- for interviewers who prefer Docs. These columns are the join between the two.

-- ── 1. Folder pointer on the applicant ───────────────────────────────────────
-- drive_folder_id is the candidate's folder; drive_folder_url is cached so the
-- UI can render an "Open Drive folder" link without a Drive round trip.
alter table applicants add column if not exists drive_folder_id      text;
alter table applicants add column if not exists drive_folder_url     text;
alter table applicants add column if not exists drive_provisioned_at timestamptz;

create index if not exists applicants_drive_folder_idx on applicants (drive_folder_id);

-- The Form hands us an authoritative candidate -> resume mapping, so a resume
-- linked this way was not guessed at all. Distinguish it from the four fuzzy
-- filename tiers in lib/resume-match.ts and from a human's manual fix-up.
--
-- resume_match has no CHECK constraint today (see db/interview.sql) — it is a
-- free-text provenance tag — so 'form' needs no schema change. Recorded here so
-- the vocabulary stays documented in one place:
--   email | name | token | fuzzy  — inferred from the filename (resume-match.ts)
--   manual                        — a human linked it in the console
--   form                          — taken straight from the Form response

-- ── 2. Provisioning ledger ───────────────────────────────────────────────────
-- One row per (candidate, artifact). This is what makes provisioning idempotent:
-- a run creates only the assets that are missing, so re-running after a partial
-- failure resumes instead of duplicating folders. Deliberately NOT a set of
-- columns on `applicants` — we need to know which individual artifacts exist,
-- and a human deleting one rubric doc should cause exactly that one to be
-- recreated on the next run.
create table if not exists candidate_drive_assets (
  applicant_id uuid not null references applicants(id) on delete cascade,
  kind         text not null,
  file_id      text not null,
  web_link     text,
  created_at   timestamptz not null default now(),
  primary key (applicant_id, kind)
);

alter table candidate_drive_assets drop constraint if exists candidate_drive_assets_kind_check;
alter table candidate_drive_assets add constraint candidate_drive_assets_kind_check
  check (kind in ('folder', 'resume', 'case_rubric', 'behavioral_rubric', 'notes'));

-- Reverse lookup: "what is this Drive file?" when auditing the folder tree.
create index if not exists candidate_drive_assets_file_idx on candidate_drive_assets (file_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same posture as the rest of the ATS: deny-by-default for anon, service role
-- (server-only) bypasses. All access goes through the API, which enforces the
-- NextAuth session and exec role.
alter table candidate_drive_assets enable row level security;
