// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { POST } from "@/features/03-recruitment-ats/app/api/recruitment/assign/route";
export const dynamic = "force-dynamic";
