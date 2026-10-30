import { createServerClient } from "@/lib/supabase/server";
import { WorkError, canManage, type Project, type Board, type Action, type Teammate, type Workstream, type WorkItem } from "./model";
export type Actor = { id: string; role: string };
function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new WorkError("Project workspaces are not configured yet.",503);
  return createServerClient();
}
function check(error: { code?: string } | null) {
  if (!error) return;
  if (["PGRST205","PGRST202","42P01","42883"].includes(error.code??"")) throw new WorkError("Exec must apply the workstream migration to enable this workspace.",503);
  if (error.code==="P0001" || error.code==="23505") throw new WorkError("This change conflicts with the latest project, task or roster. Reload and check your access, assignee and workstream.",409);
  throw new WorkError("Could not load or save project work. Please try again.",503);
}
export async function liveActor(id: string): Promise<Actor|null> {
  const {data,error}=await db().from("members").select("id,role").eq("id",id).maybeSingle();
  check(error); return data;
}
export async function listProjects(actor: Actor): Promise<Project[]> {
  const client=db();
  let ids:string[]|null=null;
  if(actor.role!=="exec"){
    const seats=await client.from("project_members").select("project_id").eq("member_id",actor.id);
    check(seats.error);
    ids=(seats.data??[]).map((s)=>s.project_id);
    if(!ids.length)return [];
  }
  let query=client.from("projects").select("id,name,client,cohort,active").order("cohort",{ascending:false}).order("name");
  if(ids)query=query.in("id",ids);
  const result=await query;check(result.error);return (result.data??[]) as Project[];
}
export async function loadBoard(actor: Actor, projectId: string): Promise<Board> {
  // Scope before reading any work/roster records, including for direct API URLs.
  const project=(await listProjects(actor)).find((p)=>p.id===projectId);
  if(!project)throw new WorkError("Project not found.",404);
  const client=db();
  const [team,streams,tasks]=await Promise.all([
    client.from("project_members").select("member_id,seat,members(full_name)").eq("project_id",projectId),
    client.from("project_workstreams").select("id,project_id,title,description").eq("project_id",projectId).order("created_at"),
    client.from("project_work_items").select("id,project_id,workstream_id,title,description,assignee_id,due_on,status,deliverable_url,updated_at").eq("project_id",projectId).order("due_on",{nullsFirst:false}).order("created_at"),
  ]);
  [team.error,streams.error,tasks.error].forEach(check);
  const members=(team.data??[]).map((m)=>({
    member_id:m.member_id,seat:m.seat,
    full_name:(m.members as unknown as {full_name:string|null}|null)?.full_name??"CUBE member",
  })) as Teammate[];
  return {project,member_id:actor.id,can_manage:project.active&&canManage(actor.role,members.find((m)=>m.member_id===actor.id)?.seat??null),
    members,workstreams:(streams.data??[]) as Workstream[],tasks:(tasks.data??[]) as WorkItem[]};
}
export async function mutateWork(actor: Actor, action: Action) {
  const {error}=await db().rpc("project_work_mutate",{actor:actor.id,payload:action});check(error);
}
