-- Pipeline store (Supabase / Postgres). Run once in the Supabase SQL editor.
--
-- The editable board reads/writes THIS table (not the outreach sheet directly).
-- "Sync from outreach sheet" imports leads from the bot's Leads tab into here:
-- new leads are inserted; for leads that already exist, only the source fields are
-- refreshed — the stage, notes, custom fields, and position a human set on the board
-- are preserved. So drag-and-drop edits survive re-syncs.
--
-- Touched only by server code via the SERVICE ROLE key (lib/supabase/server.ts),
-- which bypasses RLS. RLS is on + deny-by-default for anon.

create extension if not exists "pgcrypto";

create table if not exists pipeline_leads (
  id             uuid primary key default gen_random_uuid(),
  lead_key       text unique not null,            -- dedupe key: lowercased email, else slug(company|name)
  name           text,
  company        text,
  email          text,
  industry       text,
  source         text,                            -- apollo / prospects / alumni / inbound
  stage          text not null default 'prospect',-- prospect|contacted|replied|call|loi|active|shipped|testimonial
  owner          text,
  notes          text,
  custom         jsonb not null default '{}'::jsonb,  -- arbitrary card fields
  contacted_at   text,
  replied_at     text,
  last_contacted text,
  position       int not null default 0,          -- order within a stage column
  imported_at    timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists pipeline_leads_stage_idx on pipeline_leads (stage);

alter table pipeline_leads enable row level security;
-- (No anon policies — all access is via the server service role.)
