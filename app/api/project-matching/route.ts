import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { UUID, InputError, parseProfile, parsePreference, parseAdminAction } from "@/features/08-member-matching/lib/model";
import { currentMember, loadMatching, saveProfile, savePreference, manageMatching, StoreError } from "@/features/08-member-matching/lib/store";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function member() {
  const session = await auth();
  if (!session?.user?.memberId || !UUID.test(session.user.memberId)) return null;
  return currentMember(session.user.memberId);
}
function fail(error: unknown) {
  if (error instanceof InputError) return json({ error: error.message }, 400);
  if (error instanceof StoreError) return json({ error: error.message }, error.status);
  return json({ error: "Profiles and matching are temporarily unavailable. Your changes have not been confirmed." }, 503);
}
/** Bound streamed bodies too, rather than trusting a Content-Length header. */
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new InputError("A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 16384) { await reader.cancel(); throw new InputError("Request is too large."); }
      chunks.push(value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder().decode(data)) as unknown;
  } catch (e) {
    if (e instanceof InputError) throw e;
    throw new InputError("Invalid JSON.");
  } finally { reader.releaseLock(); }
}
function sameOrigin(request: Request) {
  // JSON mutation requests are same-origin; reject cross-site browser writes.
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return false;
  return request.headers.get("content-type")?.split(";")[0].trim() === "application/json";
}
export async function GET() {
  try {
    const viewer = await member();
    if (!viewer) return json({ error: "Sign in as a current member." }, 401);
    return json(await loadMatching(viewer));
  } catch (e) { return fail(e); }
}
export async function PUT(request: Request) {
  try {
    const viewer = await member();
    if (!viewer) return json({ error: "Sign in as a current member." }, 401);
    if (!sameOrigin(request)) return json({ error: "Use a same-origin JSON request." }, 403);
    await saveProfile(viewer.id, parseProfile(await body(request)));
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
export async function POST(request: Request) {
  try {
    const viewer = await member();
    if (!viewer) return json({ error: "Sign in as a current member." }, 401);
    if (!sameOrigin(request)) return json({ error: "Use a same-origin JSON request." }, 403);
    await savePreference(viewer.id, parsePreference(await body(request)));
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
export async function PATCH(request: Request) {
  try {
    const viewer = await member();
    if (!viewer) return json({ error: "Sign in as a current member." }, 401);
    if (viewer.role !== "exec") return json({ error: "Exec access required." }, 403);
    if (!sameOrigin(request)) return json({ error: "Use a same-origin JSON request." }, 403);
    await manageMatching(viewer.id, parseAdminAction(await body(request)));
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
