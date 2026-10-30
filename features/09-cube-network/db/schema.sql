-- Run AFTER db/schema.sql, alumni/schema.sql and member-matching/schema.sql.
-- Additive/idempotent. No people's records, verified statuses or consent seeded.
begin;
alter table member_profiles add column if not exists directory_visible boolean not null default false;
alter table member_profiles add column if not exists open_to_mentor boolean not null default false;
alter table member_profiles add column if not exists share_email boolean not null default false;
create table if not exists directory_reviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid unique references members(id) on delete cascade,
  alumni_id uuid unique references alumni(id) on delete cascade,
  linkedin_snapshot text,
  identity_status text not null default 'unknown' check (identity_status in ('unknown','evidence_found','conflict')),
  uiuc_status text not null default 'unknown' check (uiuc_status in ('unknown','evidence_found','conflict')),
  source_url text not null default '',
  notes text not null default '' check (length(notes)<=600),
  checked_at timestamptz not null default now(),
  checked_by uuid references members(id) on delete set null,
  check ((member_id is not null)::int + (alumni_id is not null)::int = 1)
);
alter table directory_reviews enable row level security;
revoke all on directory_reviews from anon, authenticated;
grant all on directory_reviews to service_role;
commit;
