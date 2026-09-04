import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { downloadScreenshot, getFeedback } from "@/features/06-portal-feedback/lib/store";

// Streams a feedback screenshot through our own auth.
//
// This route is the reason the bucket is private. The issue that links here is
// PUBLIC, and a screenshot of the portal is a picture of whatever the reporter
// had on screen — a strike, an accountability grid, an applicant's file. A
// signed Storage URL pasted into a public issue would hand all of that to
// anyone who read the issue, which is everyone. So the link points here, and
// the answer depends on who is asking.

export const dynamic = "force-dynamic";

// Only PNG/JPEG/WebP ever get stored (decodeScreenshot enforces it), but the
// stored value is echoed into a Content-Type header, so it is re-checked on the
// way out rather than trusted. A row edited by hand cannot turn this route into
// a way to serve `text/html` from the portal's own origin.
const SERVABLE = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();

  // Not a 401. This link is clicked from a GitHub issue, usually on a machine
  // that isn't signed in yet, so the useful answer is the sign-in page with a
  // way back — not a JSON error in a browser tab.
  if (!session?.user?.email) {
    const signIn = new URL("/portal/sign-in", req.nextUrl.origin);
    signIn.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return NextResponse.redirect(signIn);
  }

  // The link carries a cosmetic extension ("<uuid>.png") so a saved file gets a
  // sensible name; the id is what actually addresses the row.
  const { id: raw } = await ctx.params;
  const id = raw.replace(/\.(png|jpe?g|webp)$/i, "");

  const feedback = await getFeedback(id);
  if (!feedback?.screenshot_path) {
    return NextResponse.json({ error: "No screenshot on file for this report." }, { status: 404 });
  }

  // Whoever filed it, or exec. Deliberately narrower than "any member": the
  // widget will happily capture a page a given member could never have opened
  // themselves, and it would be a strange feature that let a consultant read an
  // exec's screen by way of a bug report.
  const viewerEmail = session.user.email.toLowerCase();
  const isSubmitter = feedback.member_email.toLowerCase() === viewerEmail;
  if (!isSubmitter && session.user.role !== "exec") {
    return NextResponse.json({ error: "Only exec and the reporter can view this screenshot." }, { status: 403 });
  }

  const bytes = await downloadScreenshot(feedback.screenshot_path);
  if (!bytes) return NextResponse.json({ error: "Screenshot could not be read." }, { status: 404 });

  const mime = feedback.screenshot_mime && SERVABLE.has(feedback.screenshot_mime)
    ? feedback.screenshot_mime
    : "application/octet-stream";

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="feedback-${id}"`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      // May contain anything the portal shows. Nothing shared caches it.
      "Cache-Control": "private, no-store",
    },
  });
}
