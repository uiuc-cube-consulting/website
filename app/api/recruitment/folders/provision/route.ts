// Route shim — real handler in the feature folder. Route segment config can't be
// re-exported, so `dynamic` and `maxDuration` are declared here too.
export { POST } from "@/features/03-recruitment-ats/app/api/recruitment/folders/provision/route";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
