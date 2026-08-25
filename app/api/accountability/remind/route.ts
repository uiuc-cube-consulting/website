// Route shim — real handler in the feature folder. `dynamic` declared locally.
// GET is what Vercel Cron calls; POST is the exec's "Send reminders now" button.
export { GET, POST } from "@/features/05-accountability-tracker/app/api/accountability/remind/route";
export const dynamic = "force-dynamic";
