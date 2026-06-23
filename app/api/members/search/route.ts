import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ members: [] });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("members")
    .select("id, full_name, email")
    .ilike("full_name", `%${q}%`)
    .limit(8);

  if (error) {
    console.error(error)
    return NextResponse.json({ error: "Failed to search members" }, { status: 500 });
  }

  const members = (data ?? []).map((m) => ({
    id: m.id,
    name: m.full_name,
    email: m.email,
  }));

  return NextResponse.json({ members });
}
