import { canManage, parseAction, overdue, type WorkItem } from "@/features/10-project-workstreams/lib/model";
const ID="10000000-0000-4000-8000-000000000001";
const task={action:"create_task",project_id:ID,workstream_id:null,assignee_id:null,title:"Research brief",description:"Five supported findings",due_on:"2026-11-15",status:"todo",deliverable_url:""};
it("uses project seats, not a global PM/SC title, for assignment authority",()=>{
  expect(canManage("project_manager",null)).toBe(false);
  expect(canManage("senior_consultant","consultant")).toBe(false);
  expect(canManage("returning_member","senior_consultant")).toBe(true);
  expect(canManage("member","project_manager")).toBe(true);
  expect(canManage("exec",null)).toBe(true);
});
it("accepts explicit, optional assignment/deadline/workstream fields",()=>{
  expect(parseAction(task)).toEqual(task);
  expect(parseAction({...task,due_on:null})).toMatchObject({due_on:null});
});
it.each(["2026-02-30","not a date","2026-1-2","2026-11-15T00:00:00Z"])("rejects invalid calendar deadline %s",(due_on)=>{
  expect(()=>parseAction({...task,due_on})).toThrow();
});
it.each(["javascript:alert(1)","data:text/html,hi","https://user:password@example.com"])("rejects unsafe deliverable link %s",(deliverable_url)=>{
  expect(()=>parseAction({...task,deliverable_url})).toThrow();
});
it("strips identity and assignment fields from progress-only requests",()=>{
  const result=parseAction({...task,action:"progress",task_id:ID,expected_updated_at:"2026-10-30T00:00:00.123456+00:00",actor:"spoof",assignee_id:ID,title:"spoof"});
  expect(result).not.toHaveProperty("actor");
  expect(result).not.toHaveProperty("assignee_id");
  expect(result).not.toHaveProperty("title");
  expect(result).toHaveProperty("expected_updated_at","2026-10-30T00:00:00.123456+00:00");
});
it("requires a revision for edits and limits workstream/task text",()=>{
  expect(()=>parseAction({...task,action:"edit_task",task_id:ID})).toThrow();
  expect(()=>parseAction({...task,title:""})).toThrow();
  expect(()=>parseAction({...task,description:"x".repeat(2001)})).toThrow();
  expect(()=>parseAction({action:"create_stream",project_id:ID,title:"x".repeat(121),description:""})).toThrow();
  expect(()=>parseAction({...task,status:"magic"})).toThrow();
  expect(()=>parseAction({...task,assignee_id:"not-a-member-id"})).toThrow();
});
it("marks overdue by calendar date, never marks a completed task late",()=>{
  expect(overdue({...task,status:"todo",due_on:"2026-10-29"} as unknown as WorkItem,"2026-10-30")).toBe(true);
  expect(overdue({...task,status:"todo",due_on:"2026-10-30"} as unknown as WorkItem,"2026-10-30")).toBe(false);
  expect(overdue({...task,status:"done",due_on:"2026-10-29"} as unknown as WorkItem,"2026-10-30")).toBe(false);
});
