-- DISPOSABLE database only, after base members + accountability + work schemas.
begin;
insert into members(id,full_name,email,role) values
('10000000-0000-4000-8000-000000000001','Example Exec','exec@example.com','exec'),
('10000000-0000-4000-8000-000000000002','Example PM','pm@example.com','project_manager'),
('10000000-0000-4000-8000-000000000003','Example SC','sc@example.com','returning_member'),
('10000000-0000-4000-8000-000000000004','Example Consultant','consultant@example.com','member'),
('10000000-0000-4000-8000-000000000005','Example Outsider','outside@example.com','project_manager');
insert into projects(id,name,cohort,starts_on) values
('20000000-0000-4000-8000-000000000001','Example project','TEST','2026-01-01'),
('20000000-0000-4000-8000-000000000002','Other project','TEST','2026-01-01');
insert into project_members(project_id,member_id,seat) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','project_manager'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','senior_consultant'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','consultant'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','project_manager');
do $$
declare
  ex uuid:='10000000-0000-4000-8000-000000000001';
  pm uuid:='10000000-0000-4000-8000-000000000002';
  sc uuid:='10000000-0000-4000-8000-000000000003';
  consultant uuid:='10000000-0000-4000-8000-000000000004';
  outsider uuid:='10000000-0000-4000-8000-000000000005';
  pid uuid:='20000000-0000-4000-8000-000000000001';
  payload jsonb; tid uuid; sid uuid; rev timestamptz;
begin
  payload:=jsonb_build_object('action','create_stream','project_id',pid,'title','Research','description','Evidence');
  begin
    perform project_work_mutate(outsider,payload);raise exception 'FAIL: global PM without seat managed project';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform project_work_mutate(consultant,payload);raise exception 'FAIL: consultant created workstream';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform project_work_mutate(sc,payload);
  select id into sid from project_workstreams where project_id=pid;
  payload:=jsonb_build_object('action','create_task','project_id',pid,'workstream_id',sid,'assignee_id',consultant,'title','Interview brief','description','Five findings','due_on','2026-11-15','status','todo','deliverable_url','');
  perform project_work_mutate(pm,payload);
  select id,updated_at into tid,rev from project_work_items where project_id=pid;
  begin
    perform project_work_mutate(pm,payload||jsonb_build_object('assignee_id',outsider));raise exception 'FAIL: assigned another team member';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform project_work_mutate(consultant,payload||jsonb_build_object('action','edit_task','task_id',tid,'expected_updated_at',rev));raise exception 'FAIL: consultant edited assignment';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
  perform project_work_mutate(consultant,jsonb_build_object('action','progress','project_id',pid,'task_id',tid,'expected_updated_at',rev,'status','in_progress','deliverable_url','https://example.com/brief'));
  if (select status from project_work_items where id=tid)<>'in_progress' then raise exception 'FAIL: own progress not saved'; end if;
  begin
    perform project_work_mutate(sc,payload||jsonb_build_object('action','edit_task','task_id',tid,'expected_updated_at',rev));raise exception 'FAIL: stale edit overwrote progress';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
  select updated_at into rev from project_work_items where id=tid;
  perform project_work_mutate(sc,payload||jsonb_build_object('action','edit_task','task_id',tid,'expected_updated_at',rev,'assignee_id',pm));
  select updated_at into rev from project_work_items where id=tid;
  begin
    perform project_work_mutate(consultant,jsonb_build_object('action','progress','project_id',pid,'task_id',tid,'expected_updated_at',rev,'status','done','deliverable_url',''));raise exception 'FAIL: consultant updated another assignee task';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
  begin
    perform project_work_mutate(ex,payload||jsonb_build_object('project_id','20000000-0000-4000-8000-000000000002','assignee_id',null));raise exception 'FAIL: cross-project workstream accepted';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
  update projects set active=false where id=pid;
  begin
    perform project_work_mutate(pm,payload);raise exception 'FAIL: archived project accepted new work';
  exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
end;
$$;
set local role anon;
do $$ begin
  begin perform * from project_work_items;raise exception 'FAIL: anonymous task read';exception when insufficient_privilege then null;end;
  begin perform project_work_mutate('10000000-0000-4000-8000-000000000001','{}');raise exception 'FAIL: anonymous RPC write';exception when insufficient_privilege then null;end;
end;$$;
reset role;
rollback;
