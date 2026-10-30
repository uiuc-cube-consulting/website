jest.mock("@/lib/supabase/server",()=>({createServerClient:jest.fn()}));
import {createServerClient} from "@/lib/supabase/server";
import {listProjects,loadBoard,mutateWork} from "@/features/10-project-workstreams/lib/store";
const P="20000000-0000-4000-8000-000000000001",OTHER="20000000-0000-4000-8000-000000000002",M="10000000-0000-4000-8000-000000000001";
const from=jest.fn(),rpc=jest.fn();
const projects=[{id:P,name:"Example project",client:null,cohort:"TEST",active:true}];
let seats:{project_id:string}[];
let seat:string;
let taskError:null|{code:string};
let calls:{table:string;select:string;filters:unknown[][]}[];
beforeEach(()=>{
  jest.clearAllMocks();seats=[{project_id:P}];seat="consultant";taskError=null;calls=[];
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";process.env.SUPABASE_SERVICE_ROLE_KEY="fixture-only";
  from.mockImplementation((table:string)=>{
    const call={table,select:"",filters:[] as unknown[][]};calls.push(call);
    const q:{select:jest.Mock;eq:jest.Mock;in:jest.Mock;order:jest.Mock;then:(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>Promise<unknown>}={
      select:jest.fn((value:string)=>{call.select=value;return q;}),
      eq:jest.fn((...args:unknown[])=>{call.filters.push(["eq",...args]);return q;}),
      in:jest.fn((...args:unknown[])=>{call.filters.push(["in",...args]);return q;}),
      order:jest.fn(()=>q),
      then:(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown)=>{
        const data=table==="projects"?projects:table==="project_members"?(call.select.includes("members(")?[{member_id:M,seat,members:{full_name:"Example Member"}}]:seats):[];
        return Promise.resolve({data,error:table==="project_work_items"?taskError:null}).then(resolve,reject);
      },
    };return q;
  });
  rpc.mockResolvedValue({error:null});
  (createServerClient as jest.Mock).mockReturnValue({from,rpc});
});
afterAll(()=>{delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;});
it("does not query arbitrary project data when a member has no seats",async()=>{
  seats=[];expect(await listProjects({id:M,role:"project_manager"})).toEqual([]);
  expect(calls.map(c=>c.table)).toEqual(["project_members"]);
});
it("limits project queries to the actor's actual seat IDs",async()=>{
  await listProjects({id:M,role:"project_manager"});
  expect(calls.find(c=>c.table==="projects")?.filters).toContainEqual(["in","id",[P]]);
});
it("scopes before reading workstreams, team names or tasks",async()=>{
  await expect(loadBoard({id:M,role:"member"},OTHER)).rejects.toMatchObject({status:404});
  expect(calls.some(c=>["project_work_items","project_workstreams"].includes(c.table))).toBe(false);
  expect(calls.filter(c=>c.table==="project_members")).toHaveLength(1);
});
it("uses the project seat even when the actor has a global PM title",async()=>{
  const board=await loadBoard({id:M,role:"project_manager"},P);
  expect(board.can_manage).toBe(false);
  expect(board.members).toEqual([{member_id:M,seat:"consultant",full_name:"Example Member"}]);
  expect(calls.some(c=>c.select.includes("email")||c.table.includes("rating"))).toBe(false);
  seat="senior_consultant";
  expect((await loadBoard({id:M,role:"returning_member"},P)).can_manage).toBe(true);
});
it("allows exec visibility but does not turn missing task storage into an empty board",async()=>{
  await listProjects({id:M,role:"exec"});
  expect(calls.map(c=>c.table)).toEqual(["projects"]);
  taskError={code:"42P01"};
  await expect(loadBoard({id:M,role:"exec"},P)).rejects.toMatchObject({status:503});
});
it("derives the RPC actor and propagates conflicts",async()=>{
  const action={action:"create_stream" as const,project_id:P,title:"Research",description:""};
  await mutateWork({id:M,role:"member"},action);
  expect(rpc).toHaveBeenCalledWith("project_work_mutate",{actor:M,payload:action});
  rpc.mockResolvedValue({error:{code:"P0001"}});
  await expect(mutateWork({id:M,role:"member"},action)).rejects.toMatchObject({status:409});
});
