-- Recruitment ATS schema (Supabase / Postgres).
-- Apply once in the Supabase SQL editor. The app talks to these tables with the
-- SERVICE ROLE key from server code only (API routes), so RLS is enabled and left
-- deny-by-default for the anon/public role — the service role bypasses RLS.

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ── Applicants ───────────────────────────────────────────────────────────────
create table if not exists applicants (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  year        text,            -- e.g. "Sophomore"
  major       text,
  college     text,
  responses   jsonb not null default '{}'::jsonb,  -- free-form intake answers
  stage       text not null default 'applied'      -- applied|screened|interview|offer|accepted|rejected|withdrawn
);
create index if not exists applicants_stage_idx on applicants (stage);

-- ── Reviews (one per reviewer per applicant) ─────────────────────────────────
create table if not exists reviews (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  applicant_id   uuid not null references applicants(id) on delete cascade,
  reviewer_email text not null,
  scores         jsonb not null,        -- { problem_solving, communication, drive, fit } each 1–5
  weighted_total numeric not null,      -- 1–5, precomputed from scores + rubric weights
  notes          text,
  unique (applicant_id, reviewer_email) -- one review per reviewer per applicant
);
create index if not exists reviews_applicant_idx on reviews (applicant_id);

-- ── Assignments (spread reviewer load; optional) ─────────────────────────────
create table if not exists assignments (
  applicant_id   uuid not null references applicants(id) on delete cascade,
  reviewer_email text not null,
  assigned_at    timestamptz not null default now(),
  primary key (applicant_id, reviewer_email)
);

-- ── Decisions (current stage decision per applicant) ─────────────────────────
create table if not exists decisions (
  applicant_id uuid primary key references applicants(id) on delete cascade,
  decision     text not null,          -- advance|reject|hold|offer|accepted
  decided_by   text not null,
  decided_at   timestamptz not null default now(),
  note         text
);

-- ── Interviews (phase 2 — schema included so it's ready) ─────────────────────
create table if not exists interview_slots (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  capacity   int not null default 1,
  location   text
);
create table if not exists interviews (
  id           uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references applicants(id) on delete cascade,
  slot_id      uuid references interview_slots(id) on delete set null,
  panel        text,
  outcome      text,
  created_at   timestamptz not null default now()
);

-- ── RLS: deny anon by default; the server service role bypasses RLS ──────────
alter table applicants      enable row level security;
alter table reviews         enable row level security;
alter table assignments     enable row level security;
alter table decisions       enable row level security;
alter table interview_slots enable row level security;
alter table interviews      enable row level security;
-- (No policies for anon = no anon access. All reads/writes go through our API,
--  which uses the service role and enforces auth via NextAuth.)
