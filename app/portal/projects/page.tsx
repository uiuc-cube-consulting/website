import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { ProjectWorkspace } from "@/features/10-project-workstreams/components/ProjectWorkspace";
export default async function ProjectsPage(){
  const session=await auth();
  if(!session?.user?.memberId)redirect("/portal/sign-in");
  return <ProjectWorkspace/>;
}
