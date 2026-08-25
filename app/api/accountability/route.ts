// Route shim — real handlers in the feature folder. `dynamic` declared locally.
export { GET, POST } from "@/features/05-accountability-tracker/app/api/accountability/route";
export const dynamic = "force-dynamic";
