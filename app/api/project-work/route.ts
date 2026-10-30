import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { UUID, WorkError, identifier, parseAction } from "@/features/10-project-workstreams/lib/model";
import { liveActor, listProjects, loadBoard, mutateWork } from "@/features/10-project-workstreams/lib/store";
export const dynamic="force-dynamic";
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
async function actor(){
  const session=await auth();
  if(!session?.user?.memberId||!UUID.test(session.user.memberId))return null;
  return liveActor(session.user.memberId);
}
function fail(e:unknown){return e instanceof WorkError?json({error:e.message},e.status):json({error:"Project work is unavailable. Your changes have not been confirmed."},503);}
export async function GET(request:Request){
  try{
    const viewer=await actor();if(!viewer)return json({error:"Sign in as a current member."},401);
    const project=new URL(request.url).searchParams.get("project");
    return json(project?await loadBoard(viewer,identifier(project)):{projects:await listProjects(viewer)});
  }catch(e){return fail(e);}
}
export async function POST(request:Request){
  try{
    const viewer=await actor();if(!viewer)return json({error:"Sign in as a current member."},401);
    const origin=request.headers.get("origin");
    if((origin&&origin!==new URL(request.url).origin)||request.headers.get("sec-fetch-site")==="cross-site"||request.headers.get("content-type")?.split(";")[0]!=="application/json")return json({error:"Use a same-origin JSON request."},403);
    const reader=request.body?.getReader();if(!reader)throw new WorkError("A JSON body is required.");
    const decoder=new TextDecoder();let text="",size=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new WorkError("Request is too large.");}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
    let body:unknown;try{body=JSON.parse(text);}catch{throw new WorkError("Invalid JSON.");}
    await mutateWork(viewer,parseAction(body));return json({ok:true});
  }catch(e){return fail(e);}
}
