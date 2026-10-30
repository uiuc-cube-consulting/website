"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, ClipboardList, ExternalLink, Layers, Plus, UserRound, X } from "lucide-react";
import { STATUSES, STATUS_LABEL, overdue, type Board, type Project, type WorkItem, type Status } from "../lib/model";

const input="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm focus:outline-2 focus:outline-[var(--brand)]";
const card="rounded-2xl border border-[var(--border)] bg-white p-5 md:p-6";
const button="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--bg-cream)] disabled:opacity-40";
async function api(endpoint:string,project?:string,body?:unknown){
  const res=await fetch(project?`${endpoint}${endpoint.includes("?")?"&":"?"}project=${project}`:endpoint,{method:body?"POST":"GET",headers:{"Content-Type":"application/json"},cache:"no-store",...(body?{body:JSON.stringify(body)}:{})});
  const value=await res.json();if(!res.ok)throw new Error(value.error??"Could not confirm your changes.");return value;
}
function errorMessage(e:unknown){return e instanceof Error?e.message:"Please try again.";}
export function ProjectWorkspace({endpoint="/api/project-work"}:{endpoint?:string}){
  const [projects,setProjects]=useState<Project[]>([]);
  const [selected,setSelected]=useState("");
  const [board,setBoard]=useState<Board|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("");
  const [mine,setMine]=useState(false);
  const [stream,setStream]=useState("");
  const [assigned,setAssigned]=useState("");
  const [late,setLate]=useState(false);
  const [editing,setEditing]=useState<WorkItem|"new"|null>(null);
  const [streamTitle,setStreamTitle]=useState("");
  const [streamDescription,setStreamDescription]=useState("");
  const [busy,setBusy]=useState(false);
  const [today]=useState(()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()));
  useEffect(()=>{let active=true;api(endpoint).then((result)=>{if(active){setProjects(result.projects);setSelected(result.projects.find((p:Project)=>p.active)?.id??result.projects[0]?.id??"");setLoaded(true);}}).catch((e)=>{if(active){setError(errorMessage(e));setLoaded(true);}});return()=>{active=false;};},[endpoint]);
  useEffect(()=>{if(!selected)return;let active=true;api(endpoint,selected).then((value)=>{if(active){setBoard(value);setLoading(false);}}).catch((e)=>{if(active){setError(errorMessage(e));setLoading(false);}});return()=>{active=false;};},[endpoint,selected]);
  const refresh=useCallback(async()=>{
    if(selected){setBoard(await api(endpoint,selected));return;}
    const result=await api(endpoint);
    setProjects(result.projects);setSelected(result.projects.find((p:Project)=>p.active)?.id??result.projects[0]?.id??"");setLoaded(true);
  },[endpoint,selected]);
  async function save(body:unknown){await api(endpoint,undefined,body);await refresh();}
  const tasks=(board?.tasks??[]).filter((t)=>(!mine||t.assignee_id===board?.member_id)&&(!stream||t.workstream_id===stream)&&(!assigned||t.assignee_id===assigned)&&(!late||overdue(t,today)));
  return <div className="container-x py-10 md:py-14">
    <p className="eyebrow">Project delivery</p><div className="mt-3 flex flex-wrap items-end justify-between gap-5"><div><h1 className="text-4xl md:text-5xl">A clear plan. A shared workspace.</h1><p className="mt-4 max-w-2xl text-[var(--muted)]">Workstreams, owners, deadlines and deliverables—organized around your project team.</p></div><label className="text-sm font-semibold">Project<select aria-label="Project" className={`${input} min-w-60`} value={selected} onChange={(e)=>{setLoading(true);setSelected(e.target.value);setBoard(null);setStream("");setAssigned("");setError("");setStatus("");setEditing(null);}}>{!projects.length&&<option value="">No projects available</option>}{projects.map((p)=><option key={p.id} value={p.id}>{p.name} · {p.cohort}{p.active?"":" · archived"}</option>)}</select></label></div>
    {error&&<div role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button className={`${button} ml-3`} onClick={()=>{void refresh().then(()=>setError("")).catch((e)=>setError(errorMessage(e)));}}>Reload project</button></div>}
    {!loaded&&<p role="status" className="mt-8 text-[var(--muted)]">Loading your projects…</p>}
    {loaded&&!projects.length&&!error&&<div className={`${card} mt-8`}><Layers className="text-[var(--brand)]"/><h2 className="mt-3 text-xl">No project seats yet.</h2><p className="mt-2 text-sm text-[var(--muted)]">Ask exec to add your seat to the project roster. A club-wide PM or SC title does not grant access to another team.</p></div>}
    {loading&&<p role="status" className="mt-8">Loading project workspace…</p>}
    {board&&<>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">{[
        {icon:Layers,label:"Workstreams",value:board.workstreams.length},
        {icon:CheckCircle2,label:"Deliverables completed",value:`${board.tasks.filter((t)=>t.status==="done").length} / ${board.tasks.length}`},
        {icon:CalendarDays,label:"Overdue deliverables",value:board.tasks.filter((t)=>overdue(t,today)).length},
      ].map(({icon:Icon,label,value})=><div key={label} className={`${card} flex items-center gap-4`}><span className="rounded-xl bg-[var(--bg-cream)] p-3 text-[var(--brand)]"><Icon size={20}/></span><div><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div></div>)}</div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--bg-cream)] p-4 text-sm"><p>{board.project.active?(board.can_manage?"PM / SC workspace · create workstreams, assign work and keep delivery on track.":"Team workspace · view project work and update your own assigned deliverables."):"Archived project · read-only history."}</p><p className="text-xs text-[var(--muted)]">Deadlines are calendar dates · overdue uses Central time</p></div>
      {board.can_manage&&<div className="mt-6 grid items-start gap-5 md:grid-cols-2"><details className={card}><summary className="cursor-pointer text-sm font-semibold">+ New workstream</summary><form className="mt-5 space-y-4" onSubmit={async(e)=>{e.preventDefault();setBusy(true);setError("");setStatus("");try{await save({action:"create_stream",project_id:selected,title:streamTitle,description:streamDescription});setStreamTitle("");setStreamDescription("");setStatus("Workstream created.");}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}}><label className="block text-sm">Workstream name<input required maxLength={120} className={input} value={streamTitle} onChange={(e)=>setStreamTitle(e.target.value)} placeholder="e.g. Customer discovery"/></label><label className="block text-sm">Workstream goal<textarea maxLength={1000} rows={2} className={input} value={streamDescription} onChange={(e)=>setStreamDescription(e.target.value)}/></label><button disabled={busy} className="btn btn-gold"><Plus size={15}/>Create workstream</button></form></details><div className={`${card} flex items-center justify-between gap-4`}><div><h2 className="text-lg">Make the next step concrete.</h2><p className="mt-2 text-sm text-[var(--muted)]">Assign a deliverable, define done, and set a deadline.</p></div><button className={button} onClick={()=>setEditing("new")}><Plus size={15}/>Add deliverable</button></div></div>}
      {status&&<p role="status" className="mt-4 text-sm text-[var(--brand)]">{status}</p>}
      <div className="my-7 flex flex-wrap items-end gap-3"><button className={`${button} ${mine?"bg-[var(--brand)] text-white":""}`} aria-pressed={mine} onClick={()=>setMine(!mine)}><UserRound size={15}/>My work</button><label className="text-xs font-semibold">Workstream<select className={input} aria-label="Workstream filter" value={stream} onChange={(e)=>setStream(e.target.value)}><option value="">All workstreams</option>{board.workstreams.map((w)=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label><label className="text-xs font-semibold">Owner<select className={input} aria-label="Owner filter" value={assigned} onChange={(e)=>setAssigned(e.target.value)}><option value="">Everyone</option>{board.members.map((m)=><option key={m.member_id} value={m.member_id}>{m.full_name}</option>)}</select></label><label className="flex items-center gap-2 p-2 text-sm"><input type="checkbox" checked={late} onChange={(e)=>setLate(e.target.checked)}/>Overdue only</label><span className="ml-auto text-xs text-[var(--muted)]">{tasks.length} deliverables shown</span></div>
      {stream&&<div className="mb-5 text-sm text-[var(--muted)]">{board.workstreams.find((w)=>w.id===stream)?.description}</div>}
      {!board.tasks.length&&<div className={`${card} mb-6`}><ClipboardList className="text-[var(--brand)]"/><h2 className="mt-3 text-xl">A place for your team&rsquo;s next steps.</h2><p className="mt-2 text-sm text-[var(--muted)]">{board.can_manage?"Start a workstream and add the first deliverable.":"Your PM or SC will add work here. Your assigned tasks appear under My work."}</p></div>}
      <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-5">{STATUSES.map((status)=><section key={status} className="min-w-0 rounded-2xl bg-[var(--bg-cream)]/70 p-3"><h2 className="flex items-center justify-between px-1 py-2 text-sm">{STATUS_LABEL[status]}<span className="rounded-full bg-white px-2 py-1 text-xs">{tasks.filter((t)=>t.status===status).length}</span></h2><div className="mt-2 space-y-3">{tasks.filter((t)=>t.status===status).map((task)=><article key={task.id} className="rounded-xl border border-[var(--border)] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--brand)]">{board.workstreams.find((w)=>w.id===task.workstream_id)?.title??"General"}</p><h3 className="mt-2 break-words text-base">{task.title}</h3><p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--muted)]">{task.description||"No additional success criteria."}</p><p className="mt-4 text-xs font-semibold">{board.members.find((m)=>m.member_id===task.assignee_id)?.full_name??(task.assignee_id?"Former team member":"Unassigned")}{task.assignee_id===board.member_id&&" · You"}</p><p className={`mt-2 text-xs ${overdue(task,today)?"font-semibold text-red-700":"text-[var(--muted)]"}`}>{task.due_on?`${overdue(task,today)?"Overdue · ":"Due "}${task.due_on}`:"No deadline"}</p>{task.deliverable_url&&<a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] underline" href={task.deliverable_url} target="_blank" rel="noreferrer">Open deliverable<ExternalLink size={11}/></a>}{board.project.active&&(board.can_manage||task.assignee_id===board.member_id)&&<button className={`${button} mt-4 w-full text-xs`} onClick={()=>{setError("");setEditing(task);}}>{board.can_manage?"Edit assignment":"Update progress"}</button>}</article>)}</div></section>)}</div>
      {editing&&<TaskEditor board={board} task={editing==="new"?null:editing} onClose={()=>setEditing(null)} onSave={async(body)=>{await save(body);setEditing(null);setStatus("Deliverable saved.");}}/>}
    </>}
  </div>;
}

function TaskEditor({board,task,onClose,onSave}:{board:Board;task:WorkItem|null;onClose:()=>void;onSave:(v:unknown)=>Promise<void>}){
  const [title,setTitle]=useState(task?.title??"");
  const [description,setDescription]=useState(task?.description??"");
  const [assignee,setAssignee]=useState(task?.assignee_id??"");
  const [stream,setStream]=useState(task?.workstream_id??"");
  const [due,setDue]=useState(task?.due_on??"");
  const [status,setStatus]=useState<Status>(task?.status??"todo");
  const [link,setLink]=useState(task?.deliverable_url??"");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.key==="Escape"&&!busy)onClose();};window.addEventListener("keydown",handler);return()=>window.removeEventListener("keydown",handler);},[busy,onClose]);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{await onSave({action:board.can_manage?(task?"edit_task":"create_task"):"progress",project_id:board.project.id,...(task?{task_id:task.id,expected_updated_at:task.updated_at}:{}),
      ...(board.can_manage?{title,description,assignee_id:assignee||null,workstream_id:stream||null,due_on:due||null}:{}),status,deliverable_url:link});}catch(e){setError(errorMessage(e));}finally{setBusy(false);}
  }
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="task-heading"><form onSubmit={submit} className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl bg-white p-6"><div className="flex items-start justify-between gap-4"><h2 id="task-heading" className="text-xl">{board.can_manage?(task?"Edit deliverable":"New deliverable"):"Update your progress"}</h2><button type="button" aria-label="Close deliverable editor" disabled={busy} onClick={onClose}><X size={18}/></button></div>
    {board.can_manage?<><label className="block text-sm font-semibold">Deliverable title<input autoFocus required className={input} maxLength={160} value={title} onChange={(e)=>setTitle(e.target.value)}/></label><label className="block text-sm font-semibold">What does done look like?<textarea className={input} rows={3} maxLength={2000} value={description} onChange={(e)=>setDescription(e.target.value)}/></label><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Workstream<select className={input} value={stream} onChange={(e)=>setStream(e.target.value)}><option value="">General / no workstream</option>{board.workstreams.map((w)=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label><label className="text-sm font-semibold">Assigned to<select className={input} value={assignee} onChange={(e)=>setAssignee(e.target.value)}><option value="">Unassigned</option>{task?.assignee_id&&!board.members.some((m)=>m.member_id===task.assignee_id)&&<option value={task.assignee_id}>Former team member · reassign before saving</option>}{board.members.map((m)=><option key={m.member_id} value={m.member_id}>{m.full_name} · {m.seat.replaceAll("_"," ")}</option>)}</select></label></div><label className="block text-sm font-semibold">Deadline<input type="date" className={input} value={due} onChange={(e)=>setDue(e.target.value)}/></label></>:<><h3>{task?.title}</h3><p className="text-sm text-[var(--muted)]">{task?.description}</p></>}
    <label className="block text-sm font-semibold">Status<select className={input} value={status} onChange={(e)=>setStatus(e.target.value as Status)}>{STATUSES.map((s)=><option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label><label className="block text-sm font-semibold">Deliverable link<input type="url" className={input} maxLength={500} placeholder="https://…" value={link} onChange={(e)=>setLink(e.target.value)}/></label>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex items-center gap-4"><button disabled={busy} className="btn btn-gold">{busy?"Saving…":"Save deliverable"}</button><button type="button" disabled={busy} onClick={onClose} className="text-sm font-semibold">Cancel</button></div><p className="text-xs text-[var(--muted)]">Only project leaders change assignment or deadlines. Members update their own status and deliverable link. Shared document permissions are managed in the document provider.</p>
  </form></div>;
}
