// Route shim — the real page lives in the self-contained feature folder. This
// registers the auth-gated /portal/case-studies route (protected by proxy.ts and
// the page's own session check).
export { default, metadata } from "@/features/01-case-study-engine/app/portal/case-studies/page";
