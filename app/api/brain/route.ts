// Route shim — real handler in the feature folder. `dynamic` declared locally.
export { POST } from "@/features/04-cube-brain-rag/app/api/brain/route";
export const dynamic = "force-dynamic";
