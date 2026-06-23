-- ─────────────────────────────────────────────────────────────────────────────
-- CUBE portal — Supabase schema (members + strikes)
-- ─────────────────────────────────────────────────────────────────────────────
-- Reconstructed to match the code in this branch (auth.ts, app/api/strikes/*,
-- app/api/members/search, lib/strikes.ts). Run once in the Supabase SQL editor.
--
-- IMPORTANT: auth.ts blocks sign-in for any email NOT in `members`. Seed the
-- members table (at least the exec board) BEFORE anyone tries to log in, or the
-- portal is inaccessible. See the seed block at the bottom.
--
-- The app talks to these tables only from server code using the SERVICE ROLE key
-- (lib/supabase/server.ts), which bypasses RLS. RLS is enabled and left
-- deny-by-default so the anon/public key has no direct table access.

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ── Members ──────────────────────────────────────────────────────────────────
-- Authorization roster. role drives access (auth.ts loads it into session.user.role;
-- proxy.ts gates /portal/admin to exec and /portal/recruitment to the roles below).
create table if not exists members (
  id          uuid primary key default gen_random_uuid(),
  full_name   text,
  email       text unique not null,
  role        text not null default 'member'
                check (role in ('exec', 'project_manager', 'senior_consultant', 'returning_member', 'member')),
  cohort      text,
  created_at  timestamptz not null default now()
);
create index if not exists members_role_idx on members (role);

-- ── Strikes ──────────────────────────────────────────────────────────────────
-- strike_type      = what was filed ('half' | 'full')
-- effective_type   = what actually counts after exec review
--                    ('half' | 'full' | 'voided'); null while pending
-- status           = 'pending' (filed by PM/SC) | 'approved' | 'denied'
-- Exec-filed strikes are auto-approved (status='approved', effective_type=strike_type).
create table if not exists strikes (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references members(id) on delete cascade,
  filed_by        uuid references members(id) on delete set null,
  strike_type     text not null check (strike_type in ('half', 'full')),
  effective_type  text check (effective_type in ('half', 'full', 'voided')),
  reason          text not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'denied')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references members(id) on delete set null,
  resolution_note text
);
create index if not exists strikes_member_idx on strikes (member_id);
create index if not exists strikes_status_idx on strikes (status);

-- ── RLS: deny anon by default; the server service role bypasses RLS ───────────
alter table members enable row level security;
alter table strikes enable row level security;
-- (No policies for anon = no anon access. All reads/writes go through the API,
--  which uses the service role and enforces auth/roles via NextAuth + proxy.ts.)

-- ── Seed (EDIT emails, then run) — required so the exec board can sign in ─────
-- insert into members (full_name, email, role, cohort) values
--   ('Sujan Sriram',    'sujan@cubeconsulting.org',    'exec', 'FA26'),
--   ('Isabella Watson', 'isabella@cubeconsulting.org', 'exec', 'FA26'),
--   ('Mann Talati',     'mannat2@illinois.edu',        'exec', 'FA26')
-- on conflict (email) do update set role = excluded.role, full_name = excluded.full_name;
--
-- Add the rest of the roster with role 'member' (or project_manager / senior_consultant
-- / returning_member as appropriate). Anyone not listed here cannot sign in.
