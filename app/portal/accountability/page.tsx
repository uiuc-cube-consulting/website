// Route shim — real page in the feature folder. Registers /portal/accountability (auth-gated).
export { default, metadata } from "@/features/05-accountability-tracker/app/portal/accountability/page";
export const dynamic = "force-dynamic";
