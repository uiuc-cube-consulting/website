// Route shim — the real handler lives in the self-contained feature folder.
// Next requires route segment config (`dynamic`) to be declared statically in the
// route file itself, so only the handler is re-exported.
export { POST } from "@/features/07-alumni-directory/app/api/alumni/route";
export const dynamic = "force-dynamic";
