import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase/server";
import { computeStrikeTotal } from "@/lib/strikes";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "exec") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = createServerClient();

  const { data: strike, error } = await supabase
    .from("strikes")
    .select(`
      *,
      member:member_id ( id, full_name, email ),
      filer:filed_by ( id, full_name, email ),
      resolver:resolved_by ( id, full_name, email )
    `)
    .eq("id", id)
    .single();

  if (error || !strike) {
    return NextResponse.json({ error: "Strike not found" }, { status: 404 });
  }

  // Attach current strike total for the member
  const { data: allStrikes } = await supabase
    .from("strikes")
    .select("effective_type, status")
    .eq("member_id", strike.member_id);

  const total = computeStrikeTotal(allStrikes ?? []);

  return NextResponse.json({ strike: { ...strike, member_strike_total: total } });
}
