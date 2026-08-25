// Whether the pipeline CRM is reachable from the portal.
//
// Turned off to declutter the portal nav. Nothing is deleted: the board, the
// store, the Sheets importer and every /api/pipeline route are intact and still
// tested. This flag only controls REACHABILITY —
//
//   · app/portal/layout.tsx  hides the "Pipeline" nav link
//   · proxy.ts               redirects /portal/pipeline to /portal
//   · the page itself        redirects, so a bookmark or a direct URL cannot
//                            render it even if the proxy matcher ever changes
//
// Flip this to `true` to bring it back — no other edit required.
//
// Deliberately its own module with zero imports: proxy.ts runs in the edge
// runtime, so anything it imports must stay free of Node built-ins and of the
// googleapis/Supabase clients that lib/pipeline.ts pulls in transitively.
export const PIPELINE_ENABLED = false;
