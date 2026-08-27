// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { GET, POST } from "@/features/03-recruitment-ats/app/api/recruitment/visibility/route";
export const dynamic = "force-dynamic";
