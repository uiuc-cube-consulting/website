// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { POST } from "@/features/02-pipeline-crm/app/api/pipeline/lead/route";
export const dynamic = "force-dynamic";
