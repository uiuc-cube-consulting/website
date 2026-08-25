// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { GET } from "@/features/05-accountability-tracker/app/api/accountability/overview/route";
export const dynamic = "force-dynamic";
