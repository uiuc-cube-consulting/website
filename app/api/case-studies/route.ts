// Route shim — the real handler lives in the self-contained feature folder.
// Registers GET /api/case-studies with Next's App Router.
export { GET, dynamic } from "@/features/01-case-study-engine/app/api/case-studies/route";
