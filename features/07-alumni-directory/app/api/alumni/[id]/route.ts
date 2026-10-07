import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseAlumnusInput } from "@/features/07-alumni-directory/lib/alumni";
import { deleteAlumnus, updateAlumnus } from "@/features/07-alumni-directory/lib/store";

// A malformed id would otherwise reach Postgres and come back as a 500 (22P02).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireExec() {
  const session = await auth();
  if (!session?.user?.memberId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.role !== "exec") {
    return { error: NextResponse.json({ error: "Only exec can edit the alumni directory." }, { status: 403 }) };
  }
  return { memberId: session.user.memberId };
}

// A function, not a shared constant: a Response body can only be read once.
function notSetUp() {
  return NextResponse.json(
    { error: "Run features/07-alumni-directory/db/schema.sql in Supabase first." },
    { status: 503 }
  );
}

/** PATCH /api/alumni/[id] — replace an alum's details. EXEC ONLY. body: the full edit form. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireExec();
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Alum not found." }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseAlumnusInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const result = await updateAlumnus(id, parsed.value, gate.memberId);
  if (!result) return NextResponse.json({ error: "Alum not found." }, { status: 404 });
  if (!result.ok) {
    if (result.missing) return notSetUp();
    return NextResponse.json({ error: result.error }, { status: result.conflict ? 409 : 500 });
  }
  return NextResponse.json({ ok: true, alumnus: result.row });
}

/** DELETE /api/alumni/[id] — remove someone from the directory. EXEC ONLY. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireExec();
  if ("error" in gate) return gate.error;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Alum not found." }, { status: 404 });

  const result = await deleteAlumnus(id);
  if (!result.ok) {
    if (result.missing) return notSetUp();
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  if (!result.deleted) return NextResponse.json({ error: "Alum not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
