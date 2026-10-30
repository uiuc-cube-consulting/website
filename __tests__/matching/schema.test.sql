-- Integration assertions for a DISPOSABLE test database only.
-- Requires db/schema.sql then features/08-member-matching/db/schema.sql.
-- Uses fictional records and rolls back. Never run against production.
begin;
insert into members(id, full_name, email, role) values
('10000000-0000-4000-8000-000000000001', 'Example Exec', 'exec@example.com', 'exec'),
('10000000-0000-4000-8000-000000000002', 'Example Member', 'member@example.com', 'member');
do $$
declare
  exec_id uuid := '10000000-0000-4000-8000-000000000001';
  member_id uuid := '10000000-0000-4000-8000-000000000002';
  c uuid; other_c uuid; p uuid; other_p uuid; saved uuid[];
begin
  begin
    perform matching_manage(member_id, '{"action":"create_cycle","name":"Unauthorized"}');
    raise exception 'FAIL: ordinary member managed a cycle';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform matching_manage(exec_id, '{"action":"create_cycle","name":"Test semester"}');
  select id into c from matching_cycles where name = 'Test semester';
  begin
    perform matching_manage(exec_id, jsonb_build_object('action','publish','cycle_id',c));
    raise exception 'FAIL: empty catalog was published';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform matching_manage(exec_id, jsonb_build_object('action','add_project','cycle_id',c,'title','Test project','client','Example','summary','Test brief','tags',jsonb_build_array('Technology'),'capacity',6));
  select id into p from matching_projects where cycle_id = c;
  begin
    perform matching_save_preferences(member_id,c,array[p],5,'Draft');
    raise exception 'FAIL: saved preference for draft';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform matching_manage(exec_id, jsonb_build_object('action','publish','cycle_id',c));
  perform matching_save_preferences(member_id,c,array[p],5,'First choice');
  perform matching_save_preferences(member_id,c,array[p],6,'Updated');
  if (select count(*) from matching_preferences where cycle_id=c) <> 1 then raise exception 'FAIL: upsert duplicated member response'; end if;
  if (select hours_per_week from matching_preferences where cycle_id=c) <> 6 then raise exception 'FAIL: preferences did not update'; end if;
  begin
    perform matching_manage(exec_id, jsonb_build_object('action','add_project','cycle_id',c,'title','Late edit','client','','summary','Brief','tags','[]'::jsonb,'capacity',6));
    raise exception 'FAIL: published catalog was editable';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform matching_manage(exec_id, '{"action":"create_cycle","name":"Another semester"}');
  select id into other_c from matching_cycles where name='Another semester';
  perform matching_manage(exec_id, jsonb_build_object('action','add_project','cycle_id',other_c,'title','Other project','client','','summary','Brief','tags','[]'::jsonb,'capacity',4));
  select id into other_p from matching_projects where cycle_id=other_c;
  begin
    perform matching_manage(exec_id, jsonb_build_object('action','publish','cycle_id',other_c));
    raise exception 'FAIL: two catalogs opened at once';
  exception when unique_violation then null;
  end;
  begin
    perform matching_save_preferences(member_id,c,array[p,other_p],5,'Cross-semester');
    raise exception 'FAIL: accepted another semester project';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  begin
    perform matching_save_preferences(member_id,c,array[p,p],5,'Duplicate');
    raise exception 'FAIL: accepted duplicate ranks';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  select ranked_project_ids into saved from matching_preferences where cycle_id=c;
  if saved <> array[p] then raise exception 'FAIL: rejected save destroyed existing ranks'; end if;
  -- Force the boundary in this isolated fixture; production UI cannot edit
  -- published deadlines.
  update matching_cycles set deadline=clock_timestamp()-interval '1 second' where id=c;
  begin
    perform matching_save_preferences(member_id,c,array[p],5,'Too late');
    raise exception 'FAIL: accepted expired deadline';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform matching_manage(exec_id, jsonb_build_object('action','close','cycle_id',c));
  begin
    perform matching_save_preferences(member_id,c,array[p],5,'Closed');
    raise exception 'FAIL: accepted closed cycle';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  perform matching_manage(exec_id, jsonb_build_object('action','publish','cycle_id',other_c));
  if exists(select 1 from matching_preferences where cycle_id=other_c) then raise exception 'FAIL: preferences carried into a new semester'; end if;
end;
$$;
-- Function grants + table privacy: no direct Supabase client access.
set local role anon;
do $$
begin
  begin
    perform * from member_profiles;
    raise exception 'FAIL: anonymous profile access';
  exception when insufficient_privilege then null;
  end;
  begin
    perform matching_manage('10000000-0000-4000-8000-000000000001','{}');
    raise exception 'FAIL: anonymous RPC access';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
