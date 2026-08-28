-- ─────────────────────────────────────────────────────────────────────────────
-- CUBE portal — points tracker
-- ─────────────────────────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor AFTER db/schema.sql (this references `members`).
-- Idempotent: safe to re-run.
--
-- Replaces the Google Sheet the tracker used to read (lib/sheets.ts, now gone).
-- The Sheet was a flat name → number list: no history, no attribution, editable
-- by anyone with the link, and joined to the portal by NAME rather than by id.
--
-- ── Why a ledger instead of members.points ───────────────────────────────────
-- Points are stored as individual awards that SUM to a total, exactly like
-- `strikes` — not as one mutable integer per member.
--
--   * "Everyone starts at 0" needs no seeding at all: no rows means no points.
--     There is nothing to backfill and nothing to get out of step with `members`
--     as people join or leave.
--   * Every change says who awarded it, when, and what for. A bare integer that
--     jumped from 12 to 40 can never be explained after the fact.
--   * Corrections are just negative entries, so a mistake is reversible and
--     visible rather than silently overwritten.
--
-- The cost is one sum per member on read, over a table that holds a few hundred
-- rows a semester — irrelevant at this size.

create extension if not exists "pgcrypto";  -- gen_random_uuid()

create table if not exists point_entries (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members(id) on delete cascade,
  -- Signed: negative entries are corrections and deductions. Never 0, which
  -- would be a row that says nothing.
  delta       integer not null check (delta <> 0 and delta between -1000 and 1000),
  reason      text not null check (length(trim(reason)) > 0),
  -- Nullable so an officer's departure doesn't cascade away the award itself.
  awarded_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists point_entries_member_idx  on point_entries (member_id);
create index if not exists point_entries_created_idx on point_entries (created_at desc);

-- ── RLS: deny anon by default; the server service role bypasses RLS ──────────
alter table point_entries enable row level security;
-- (No policies for anon = no anon access. Awarding goes through POST
--  /api/points, which is exec-only and re-checks the role itself.)

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Standings, including everyone on zero. This is the same shape the API builds.
--
--   select m.full_name, m.role, coalesce(sum(p.delta), 0) as points
--   from members m
--   left join point_entries p on p.member_id = m.id
--   where m.role <> 'exec'
--   group by m.id, m.full_name, m.role
--   order by points desc, m.full_name;
