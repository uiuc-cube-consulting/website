// Route shim — the real handler lives in the self-contained feature folder.
// Next requires route segment config (`dynamic`) to be declared statically in the
// route file itself — it can't be re-exported — so we re-export only the handler
// and declare the config locally here.
export { GET } from "@/features/01-case-study-engine/app/api/case-studies/route";
export const dynamic = "force-dynamic";
