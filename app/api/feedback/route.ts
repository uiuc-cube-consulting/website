// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { POST } from "@/features/06-portal-feedback/app/api/feedback/route";
export const dynamic = "force-dynamic";
