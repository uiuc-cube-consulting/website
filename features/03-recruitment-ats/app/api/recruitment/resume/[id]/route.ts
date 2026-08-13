import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchResumeBytes } from "@/features/03-recruitment-ats/lib/drive";
import { getResumePointer } from "@/features/03-recruitment-ats/lib/interview-store";
import { canInterview } from "@/features/03-recruitment-ats/lib/interview";

// Streams a candidate's resume through our own auth, addressed by APPLICANT id —
// the Drive file id never reaches the browser. That keeps the Drive folder private
// to the service account: no per-person sharing, no "anyone with the link", and
// access dies with the session rather than living on in a URL someone forwarded.

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canInterview(session.user.role)) {
    return NextResponse.json({ error: "Interviewer access required" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const pointer = await getResumePointer(id);
  if (!pointer) return NextResponse.json({ error: "No resume on file for this candidate" }, { status: 404 });

  const file = await fetchResumeBytes(pointer.fileId, pointer.mime ?? undefined);
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: file.status });

  // Quote-strip the filename so it can't break out of the header.
  const filename = (pointer.name ?? "resume").replace(/["\\\r\n]/g, "");

  return new NextResponse(file.bytes, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Content-Length": String(file.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      // Applicant PII — don't let it settle in any cache, shared or otherwise.
      "Cache-Control": "private, no-store",
    },
  });
}
