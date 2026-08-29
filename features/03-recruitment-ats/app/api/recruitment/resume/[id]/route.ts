import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchResumeBytes } from "@/features/03-recruitment-ats/lib/drive";
import { getResumePointer } from "@/features/03-recruitment-ats/lib/interview-store";
import { canInterview } from "@/features/03-recruitment-ats/lib/interview";
import { SELF_ACCESS_DENIED } from "@/features/03-recruitment-ats/lib/self-access";
import { isOwnApplicationId } from "@/features/03-recruitment-ats/lib/self-access-store";

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

  // Your own application file is not yours to read (lib/self-access.ts). The
  // interview board already omits your own row, but this route is addressed by
  // applicant id and answers whether or not you were shown that row — an id from
  // an older cycle, or simply guessed, would otherwise stream the resume back.
  if (await isOwnApplicationId(id, session.user.email)) {
    return NextResponse.json({ error: SELF_ACCESS_DENIED }, { status: 403 });
  }

  const pointer = await getResumePointer(id);
  if (!pointer) return NextResponse.json({ error: "No resume on file for this candidate" }, { status: 404 });

  const file = await fetchResumeBytes(pointer.fileId, pointer.mime ?? undefined);
  if (!file.ok) return NextResponse.json({ error: file.error }, { status: file.status });

  // Quote-strip the filename so it can't break out of the header.
  const filename = (pointer.name ?? "resume").replace(/["\\\r\n]/g, "");

  // HTTP header values are ByteStrings — Latin-1 only. Anything above U+00FF
  // makes `new NextResponse` throw, which turns the whole download into a 500,
  // and this is not an edge case: `resumeFileName()` in lib/folder-naming.ts
  // builds every provisioned copy as "Resume — Jane Doe.pdf" with an EM DASH, so
  // the failure hit every candidate whose resume came through the Drive tree.
  // Accented names ("Résumé — José Álvarez.pdf") broke it the same way.
  //
  // RFC 6266: send an ASCII-safe `filename` for anything that only understands
  // that, plus `filename*` carrying the real UTF-8 name percent-encoded. Modern
  // browsers prefer `filename*` and the candidate's name survives intact.
  const asciiFilename = filename.replace(/[^\x20-\x7E]/g, "_") || "resume";
  // encodeURIComponent leaves !'()* alone; RFC 5987's attr-char set excludes
  // them, so they are escaped by hand rather than emitted raw into the header.
  const utf8Filename = encodeURIComponent(filename).replace(
    /['()*!]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return new NextResponse(file.bytes, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${asciiFilename}"; filename*=UTF-8''${utf8Filename}`,
      "Content-Length": String(file.bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      // Applicant PII — don't let it settle in any cache, shared or otherwise.
      "Cache-Control": "private, no-store",
    },
  });
}
