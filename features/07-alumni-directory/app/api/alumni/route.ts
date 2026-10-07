import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseAlumnusInput } from "@/features/07-alumni-directory/lib/alumni";
import { createAlumnus } from "@/features/07-alumni-directory/lib/store";

/**
 * POST /api/alumni — add someone to the directory. EXEC ONLY.
 *
 * body: the add form (see parseAlumnusInput). Members read the directory on
 * the server-rendered page, so there is no GET here.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "exec") {
    return NextResponse.json({ error: "Only exec can edit the alumni directory." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseAlumnusInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await createAlumnus(parsed.value, session.user.memberId);
  if (!result.ok) {
    if (result.missing) {
      return NextResponse.json(
        { error: "Run features/07-alumni-directory/db/schema.sql in Supabase first." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, alumnus: result.row }, { status: 201 });
}
