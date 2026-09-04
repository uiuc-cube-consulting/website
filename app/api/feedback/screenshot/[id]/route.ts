// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { GET } from "@/features/06-portal-feedback/app/api/feedback/screenshot/[id]/route";
export const dynamic = "force-dynamic";
