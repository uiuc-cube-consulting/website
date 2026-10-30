import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { InputError, UUID } from "@/features/08-member-matching/lib/model";
import { currentMember, StoreError } from "@/features/08-member-matching/lib/store";
import { parseReview } from "@/features/09-cube-network/lib/network";
import { saveReview } from "@/features/09-cube-network/lib/store";
export const dynamic = "force-dynamic";
export async function PUT(request: Request) {
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const session = await auth();
    if (!session?.user?.memberId || !UUID.test(session.user.memberId)) return json({ error: "Sign in as a current member." }, 401);
    const viewer = await currentMember(session.user.memberId);
    if (!viewer) return json({ error: "Sign in as a current member." }, 401);
    if (viewer.role !== "exec") return json({ error: "Exec access required." }, 403);
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Use a same-origin JSON request." }, 403);
    // A small streamed bound; do not trust Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new InputError("A review is required.");
    let text = "", size = 0;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); throw new InputError("Review is too large."); }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { reader.releaseLock(); }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new InputError("Invalid JSON."); }
    const saved = await saveReview(viewer.id, parseReview(value));
    return json({ ok: true, ...saved });
  } catch (e) {
    if (e instanceof InputError) return json({ error: e.message }, 400);
    if (e instanceof StoreError) return json({ error: e.message }, e.status);
    return json({ error: "Could not confirm this review. Please try again." }, 503);
  }
}
