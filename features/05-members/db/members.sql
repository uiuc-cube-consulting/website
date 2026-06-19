-- Member directory + roles (Supabase / Postgres).
-- This is the authoritative roster for AUTHORIZATION. Authentication still happens
-- via Google (NextAuth); this table decides what a signed-in person may do.
-- Run once in the Supabase SQL editor, then seed your members/exec board.

create extension if not exists "pgcrypto";

create table if not exists members (
  email          text primary key,              -- lowercase Google email
  name           text,
  role           text not null default 'member' check (role in ('exec', 'member')),
  active         boolean not null default true,
  pipeline_access boolean not null default false, -- grant a non-exec member pipeline access
  created_at     timestamptz not null default now()
);

-- Fast lookups by role (e.g. list the exec board).
create index if not exists members_role_idx on members (role) where active;

-- RLS on; the server service role bypasses it, anon has no access.
alter table members enable row level security;

-- ── Seed your board (edit emails, then run) ──────────────────────────────────
-- insert into members (email, name, role) values
--   ('sujan@cubeconsulting.org',    'Sujan Sriram',    'exec'),
--   ('isabella@cubeconsulting.org', 'Isabella Watson', 'exec'),
--   ('mannat2@illinois.edu',        'Mann Talati',     'exec')
-- on conflict (email) do update set role = excluded.role, name = excluded.name;
--
-- Grant a specific non-exec member pipeline access:
-- update members set pipeline_access = true where email = 'someone@illinois.edu';
