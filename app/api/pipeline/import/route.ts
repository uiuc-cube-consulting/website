// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { POST } from "@/features/02-pipeline-crm/app/api/pipeline/import/route";
export const dynamic = "force-dynamic";
