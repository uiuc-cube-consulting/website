// Route shim — the real handler lives in the self-contained feature folder.
// `dynamic` is route segment config: it must be declared in the route file itself
// (can't be re-exported), so we re-export only the handler and declare it here.
export { GET } from "@/features/02-pipeline-crm/app/api/pipeline/route";
export const dynamic = "force-dynamic";
