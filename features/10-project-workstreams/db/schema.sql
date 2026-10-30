-- Run after db/schema.sql and features/05-accountability-tracker/db/schema.sql.
-- Existing project/seat roster is the authority. Ratings are never read.
begin;
create table if not exists project_workstreams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 120),
  description text not null default '' check(length(description)<=1000),
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(id,project_id),
  unique(project_id,title)
);
create table if not exists project_work_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  workstream_id uuid,
  title text not null check(length(trim(title)) between 1 and 160),
  description text not null default '' check(length(description)<=2000),
  assignee_id uuid references members(id) on delete set null,
  due_on date,
  status text not null default 'todo' check(status in ('todo','in_progress','blocked','in_review','done')),
  deliverable_url text not null default '' check(length(deliverable_url)<=500),
  created_by uuid references members(id) on delete set null,
  updated_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(workstream_id,project_id) references project_workstreams(id,project_id)
);
create index if not exists project_work_items_project_due on project_work_items(project_id,due_on);
alter table project_workstreams enable row level security;
alter table project_work_items enable row level security;
revoke all on project_workstreams,project_work_items from anon,authenticated;
grant all on project_workstreams,project_work_items to service_role;

create or replace function project_work_mutate(actor uuid,payload jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare
  actor_role text; actor_seat text; leader boolean;
  pid uuid := (payload->>'project_id')::uuid;
  op text := payload->>'action';
  task project_work_items; assignee uuid; stream uuid;
begin
  select role into actor_role from members where id=actor for share;
  if not found then raise exception using errcode='P0001',message='Current membership required.'; end if;
  perform 1 from projects where id=pid and active for share;
  if not found then raise exception using errcode='P0001',message='Active project required.'; end if;
  select seat into actor_seat from project_members where project_id=pid and member_id=actor for share;
  if actor_role<>'exec' and actor_seat is null then raise exception using errcode='P0001',message='Project membership required.'; end if;
  leader := actor_role='exec' or coalesce(actor_seat in ('project_manager','senior_consultant'),false);
  if op='create_stream' then
    if not leader then raise exception using errcode='P0001',message='A PM/SC seat on this project is required.'; end if;
    insert into project_workstreams(project_id,title,description,created_by) values(pid,payload->>'title',payload->>'description',actor);
    return;
  end if;
  if op not in ('create_task','edit_task','progress') then raise exception using errcode='P0001',message='Unknown action.'; end if;
  if op<>'create_task' then
    select * into task from project_work_items where id=(payload->>'task_id')::uuid and project_id=pid for update;
    if not found then raise exception using errcode='P0001',message='Work item not found.'; end if;
    if (payload->>'expected_updated_at') is null or task.updated_at<>(payload->>'expected_updated_at')::timestamptz then
      raise exception using errcode='P0001',message='This item changed. Reload before saving.';
    end if;
  end if;
  if op='progress' then
    if not leader and task.assignee_id is distinct from actor then raise exception using errcode='P0001',message='Only your own task status may be updated.'; end if;
    update project_work_items set status=payload->>'status',deliverable_url=payload->>'deliverable_url',updated_by=actor,updated_at=clock_timestamp() where id=task.id;
    return;
  end if;
  if not leader then raise exception using errcode='P0001',message='A PM/SC seat on this project is required.'; end if;
  assignee := (payload->>'assignee_id')::uuid;
  stream := (payload->>'workstream_id')::uuid;
  if assignee is not null then
    perform 1 from project_members where project_id=pid and member_id=assignee for share;
    if not found then raise exception using errcode='P0001',message='Assignee must be on this project.'; end if;
  end if;
  if stream is not null and not exists(select 1 from project_workstreams where id=stream and project_id=pid) then
    raise exception using errcode='P0001',message='Choose a workstream from this project.';
  end if;
  if op='create_task' then
    insert into project_work_items(project_id,workstream_id,title,description,assignee_id,due_on,status,deliverable_url,created_by,updated_by)
      values(pid,stream,payload->>'title',payload->>'description',assignee,(payload->>'due_on')::date,payload->>'status',payload->>'deliverable_url',actor,actor);
  else
    update project_work_items set workstream_id=stream,title=payload->>'title',description=payload->>'description',assignee_id=assignee,
      due_on=(payload->>'due_on')::date,status=payload->>'status',deliverable_url=payload->>'deliverable_url',updated_by=actor,updated_at=clock_timestamp() where id=task.id;
  end if;
end;
$$;
revoke all on function project_work_mutate(uuid,jsonb) from public,anon,authenticated;
grant execute on function project_work_mutate(uuid,jsonb) to service_role;
commit;
