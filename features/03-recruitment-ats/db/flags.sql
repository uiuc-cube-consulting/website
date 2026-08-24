-- Applicant flags — additive migration on top of db/schema.sql.
-- Run AFTER schema.sql, once, in the Supabase SQL editor. Safe to re-run.
--
-- Any signed-in member can flag an applicant red (concern) or green (endorsement)
-- with a required note. Append-only: no edit/delete surface.

create table if not exists applicant_flags (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  applicant_id   uuid not null references applicants(id) on delete cascade,
  submitter_email text not null,
  color          text not null check (color in ('red', 'green')),
  description    text not null
);
create index if not exists applicant_flags_applicant_idx on applicant_flags (applicant_id);

alter table applicant_flags enable row level security;
-- Same posture as the rest of the ATS: deny-by-default for anon, service role
-- (server-only) bypasses. All access goes through the API, which enforces NextAuth.
