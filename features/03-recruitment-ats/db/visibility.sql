-- Singleton row controlling whether non-exec members can see the recruiting
-- area at all (applicant pool, flags, review dashboard, interview panel).
-- Exec always bypasses this — see lib/visibility.ts / lib/access.ts.
create table if not exists recruiting_settings (
  id          boolean primary key default true check (id),
  visible     boolean not null default true,
  updated_by  text,
  updated_at  timestamptz not null default now()
);

insert into recruiting_settings (id, visible)
values (true, true)
on conflict (id) do nothing;

alter table recruiting_settings enable row level security;
-- (No policies for anon = no anon access. Reads/writes go through the API,
--  which uses the service role and enforces exec-only writes via lib/access.ts.)
