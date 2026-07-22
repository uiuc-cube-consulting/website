// Route shim — the real page lives in the self-contained feature folder.
// Registers the auth-gated /portal/pipeline route.
export { default, metadata } from "@/features/02-pipeline-crm/app/portal/pipeline/page";
