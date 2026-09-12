// Whether red/green flags can be filed at all.
//
// Turned off after the FA26 cycle closed: the applicant pool, reviews, decisions
// and all 169 flags were archived and deleted on 2026-09-11, and the incoming
// members should not land in a portal that invites them to start filing
// reputational records on each other. Nothing is deleted here — FlagIntake, the
// panels, the store and `submitFlag` are intact and still tested. This flag
// controls REACHABILITY and INTAKE —
//
//   · app/portal/layout.tsx   hides the "Flags" nav link
//   · proxy.ts                redirects /portal/flags to /portal
//   · the page itself         redirects, so a bookmark or a direct URL cannot
//                             render it even if the proxy matcher ever changes
//   · POST /api/recruitment/flags  refuses, so a tab left open on the form
//                             before the deploy cannot still write a row
//
// Flip this to `true` to bring it back — no other edit required.
//
// Why POST is closed too, unlike PIPELINE_ENABLED which is reachability-only:
// the pipeline board is a read surface, so hiding the door is the whole job. The
// flag form WRITES, anonymously by default, about a named person. Someone
// holding /portal/flags open across the deploy would get a form that still
// appears to work and lands a flag in a table everyone now believes is closed.
// That is a quiet wrong answer rather than a visible one, so the route refuses
// rather than the page merely disappearing.
//
// Why this is NOT the `recruiting_settings.visible` toggle: that switch is
// cycle-scoped and exec flips it without a deploy, but flags are deliberately
// exempt from it. The most valuable ones are filed at an info night in August,
// months before there is an applicant row, which is exactly when the recruiting
// console is shut — binding intake to `visible` would switch the feature off for
// the window it exists to serve. Closing flags is therefore a separate, explicit
// decision, which is what this constant records.
//
// Deliberately its own module with zero imports: proxy.ts runs in the edge
// runtime, so anything it imports must stay free of Node built-ins and of the
// Supabase client that lib/store.ts pulls in transitively.
export const FLAG_INTAKE_ENABLED = false;
