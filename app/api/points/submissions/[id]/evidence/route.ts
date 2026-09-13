import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isEvidenceMime } from "@/lib/point-evidence";
import { downloadEvidence, getSubmission } from "@/lib/point-submissions-store";

// Streams a submission's photo through our own auth. The bucket is private, so
// this route is the only way to see one: the member who submitted it, or exec
// reviewing it. Nobody else, since the photos are of members and whoever they
// were with.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const submission = await getSubmission(id);
  if (!submission) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  const isSubmitter = submission.member_id === session.user.memberId;
  if (!isSubmitter && session.user.role !== "exec") {
    return NextResponse.json({ error: "Only exec and the member who submitted this can view the photo." }, { status: 403 });
  }

  const bytes = await downloadEvidence(submission.evidence_path);
  if (!bytes) return NextResponse.json({ error: "Photo could not be read." }, { status: 404 });

  // The stored mime is echoed into Content-Type, so it's re-checked rather than
  // trusted: a row edited by hand must not make this serve text/html.
  const mime = isEvidenceMime(submission.evidence_mime) ? submission.evidence_mime : "application/octet-stream";

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="point-evidence-${submission.id}"`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
