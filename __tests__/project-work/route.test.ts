let mockSession:{user:{memberId?:string;role?:string}}|null;
jest.mock("@/auth",()=>({auth:jest.fn(async()=>mockSession)}));
jest.mock("@/features/10-project-workstreams/lib/store",()=>({liveActor:jest.fn(),listProjects:jest.fn(),loadBoard:jest.fn(),mutateWork:jest.fn()}));
import {GET,POST} from "@/app/api/project-work/route";
import * as store from "@/features/10-project-workstreams/lib/store";
import {WorkError} from "@/features/10-project-workstreams/lib/model";
const ID="10000000-0000-4000-8000-000000000001";
const OTHER="10000000-0000-4000-8000-000000000002";
const valid={action:"create_stream",project_id:OTHER,title:"Research",description:"Interview findings"};
function req(body:unknown,origin="https://cube.test"){return new Request("https://cube.test/api/project-work",{method:"POST",headers:{"Content-Type":"application/json",origin},body:typeof body==="string"?body:JSON.stringify(body)});}
beforeEach(()=>{
  jest.clearAllMocks();mockSession={user:{memberId:ID,role:"exec"}};
  (store.liveActor as jest.Mock).mockResolvedValue({id:ID,role:"member"});
  (store.listProjects as jest.Mock).mockResolvedValue([]);
  (store.loadBoard as jest.Mock).mockResolvedValue({tasks:[]});
  (store.mutateWork as jest.Mock).mockResolvedValue(undefined);
});
it("rejects signed-out and removed members",async()=>{
  mockSession=null;expect((await POST(req(valid))).status).toBe(401);expect(store.mutateWork).not.toHaveBeenCalled();
  mockSession={user:{memberId:ID}};(store.liveActor as jest.Mock).mockResolvedValue(null);
  expect((await GET(new Request("https://cube.test/api/project-work"))).status).toBe(401);
});
it("passes the live actor, not a forged identity or stale JWT role",async()=>{
  expect((await POST(req({...valid,actor:OTHER}))).status).toBe(200);
  expect(store.mutateWork).toHaveBeenCalledWith({id:ID,role:"member"},valid);
});
it("scopes board access and propagates not-found instead of leaking a board",async()=>{
  (store.loadBoard as jest.Mock).mockRejectedValue(new WorkError("Project not found.",404));
  expect((await GET(new Request("https://cube.test/api/project-work?project="+OTHER))).status).toBe(404);
  expect(store.loadBoard).toHaveBeenCalledWith({id:ID,role:"member"},OTHER);
});
it("returns private no-store project lists",async()=>{
  const res=await GET(new Request("https://cube.test/api/project-work"));
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await res.json()).toEqual({projects:[]});
});
it("rejects cross-site requests, malformed bodies and overlarge requests",async()=>{
  expect((await POST(req(valid,"https://evil.test"))).status).toBe(403);
  expect((await POST(req("{"))).status).toBe(400);
  expect((await POST(req({...valid,description:"x".repeat(9000)}))).status).toBe(400);
  expect(store.mutateWork).not.toHaveBeenCalled();
});
it("reports conflict for stale updates and does not leak raw SQL",async()=>{
  (store.mutateWork as jest.Mock).mockRejectedValue(new WorkError("Reload before saving.",409));
  expect((await POST(req(valid))).status).toBe(409);
  (store.mutateWork as jest.Mock).mockRejectedValue(new Error("database secret details"));
  const res=await POST(req(valid));expect(res.status).toBe(503);expect(JSON.stringify(await res.json())).not.toContain("secret");
});
