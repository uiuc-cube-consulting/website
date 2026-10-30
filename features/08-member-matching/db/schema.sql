-- Run AFTER db/schema.sql. No live roster or assigned project team is changed.
-- Matching catalogs are candidate engagements, separate from accountability's
-- already-assigned teams. Exec still make final placements outside this feature.
begin;
create table if not exists member_profiles (
  member_id uuid primary key references members(id) on delete cascade,
  bio text not null default '' check (length(bio) <= 800),
  major text not null default '' check (length(major) <= 120),
  graduation_year integer check (graduation_year between 2000 and 2100),
  website text not null default '' check (length(website) <= 300),
  linkedin text not null default '' check (length(linkedin) <= 300),
  interests text[] not null default '{}' check (cardinality(interests) <= 10),
  skills text[] not null default '{}' check (cardinality(skills) <= 15),
  learning_goals text not null default '' check (length(learning_goals) <= 1000),
  updated_at timestamptz not null default now()
);
create table if not exists matching_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 80),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  deadline timestamptz,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now()
);
-- A single open catalog keeps the member dashboard unambiguous.
create unique index if not exists matching_one_open_cycle on matching_cycles(status) where status = 'open';
create table if not exists matching_projects (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references matching_cycles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  client text not null default '' check (length(client) <= 120),
  summary text not null check (length(trim(summary)) between 1 and 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  capacity integer not null check (capacity between 1 and 30),
  unique(cycle_id, title)
);
create table if not exists matching_preferences (
  cycle_id uuid not null references matching_cycles(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  ranked_project_ids uuid[] not null check (cardinality(ranked_project_ids) between 1 and 3),
  hours_per_week integer not null check (hours_per_week between 1 and 40),
  notes text not null default '' check (length(notes) <= 1000),
  updated_at timestamptz not null default now(),
  primary key(cycle_id, member_id)
);
alter table member_profiles enable row level security;
alter table matching_cycles enable row level security;
alter table matching_projects enable row level security;
alter table matching_preferences enable row level security;
-- NextAuth sessions are NOT Supabase JWTs. No anon/authenticated table policies.
revoke all on member_profiles, matching_cycles, matching_projects, matching_preferences from anon, authenticated;
grant all on member_profiles, matching_cycles, matching_projects, matching_preferences to service_role;

-- Serializes preference saves with close/publish so the API cannot race a
-- deadline or save a subset of ranks. Only server-derived member_id is passed.
create or replace function matching_save_preferences(
  actor uuid, cycle uuid, ranked uuid[], hours integer, note text
) returns void language plpgsql security invoker set search_path = public as $$
declare c matching_cycles;
begin
  select * into c from matching_cycles where id = cycle for update;
  if not found or c.status <> 'open' or (c.deadline is not null and c.deadline <= clock_timestamp()) then
    raise exception using errcode = 'P0001', message = 'Project preferences are closed for this semester.';
  end if;
  if not exists (select 1 from members where id = actor) then
    raise exception using errcode = 'P0001', message = 'Member no longer exists.';
  end if;
  if coalesce(cardinality(ranked), 0) not between 1 and 3
     or (select count(distinct x) from unnest(ranked) x) <> cardinality(ranked)
     or (select count(*) from matching_projects where cycle_id = cycle and id = any(ranked)) <> cardinality(ranked) then
    raise exception using errcode = 'P0001', message = 'Rank one to three distinct projects from this semester.';
  end if;
  insert into matching_preferences(cycle_id, member_id, ranked_project_ids, hours_per_week, notes)
    values(cycle, actor, ranked, hours, note)
    on conflict(cycle_id, member_id) do update set
      ranked_project_ids = excluded.ranked_project_ids,
      hours_per_week = excluded.hours_per_week, notes = excluded.notes, updated_at = clock_timestamp();
end;
$$;

-- Publishing freezes the catalog. Open/closed catalogs cannot be edited, so a
-- member never ranks a project which then disappears from their submission.
create or replace function matching_manage(actor uuid, payload jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare c matching_cycles; op text := payload->>'action';
begin
  if not exists (select 1 from members where id = actor and role = 'exec') then
    raise exception using errcode = 'P0001', message = 'Exec access required.';
  end if;
  if op = 'create_cycle' then
    insert into matching_cycles(name, deadline, created_by)
      values(payload->>'name', (payload->>'deadline')::timestamptz, actor);
    return;
  end if;
  select * into c from matching_cycles where id = (payload->>'cycle_id')::uuid for update;
  if not found then raise exception using errcode = 'P0001', message = 'Semester not found.'; end if;
  if op = 'add_project' and c.status = 'draft' then
    insert into matching_projects(cycle_id, title, client, summary, tags, capacity)
      values(c.id, payload->>'title', payload->>'client', payload->>'summary',
        array(select jsonb_array_elements_text(payload->'tags')), (payload->>'capacity')::integer);
  elsif op = 'publish' and c.status = 'draft' then
    if not exists (select 1 from matching_projects where cycle_id = c.id) then
      raise exception using errcode = 'P0001', message = 'Add at least one project before publishing.';
    end if;
    if c.deadline is not null and c.deadline <= clock_timestamp() then
      raise exception using errcode = 'P0001', message = 'The deadline has passed. Create a new semester.';
    end if;
    update matching_cycles set status = 'open' where id = c.id;
  elsif op = 'close' and c.status = 'open' then
    update matching_cycles set status = 'closed' where id = c.id;
  else
    raise exception using errcode = 'P0001', message = 'This action is not available for this semester.';
  end if;
end;
$$;
revoke all on function matching_save_preferences(uuid, uuid, uuid[], integer, text) from public, anon, authenticated;
revoke all on function matching_manage(uuid, jsonb) from public, anon, authenticated;
grant execute on function matching_save_preferences(uuid, uuid, uuid[], integer, text) to service_role;
grant execute on function matching_manage(uuid, jsonb) to service_role;
commit;
