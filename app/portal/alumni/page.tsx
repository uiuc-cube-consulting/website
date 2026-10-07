// Route shim — the real page lives in the self-contained feature folder. This
// registers the auth-gated /portal/alumni route (protected by proxy.ts and the
// page's own session check).
export { default, metadata } from "@/features/07-alumni-directory/app/portal/alumni/page";
