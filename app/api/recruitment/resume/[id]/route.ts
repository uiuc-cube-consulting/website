// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { GET } from "@/features/03-recruitment-ats/app/api/recruitment/resume/[id]/route";
export const dynamic = "force-dynamic";
