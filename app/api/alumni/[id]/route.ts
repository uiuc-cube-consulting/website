// Route shim — the real handlers live in the self-contained feature folder.
export { PATCH, DELETE } from "@/features/07-alumni-directory/app/api/alumni/[id]/route";
export const dynamic = "force-dynamic";
