import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchPoints } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const revalidate = 60;

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await fetchPoints();
    rows.sort((a, b) => b.points - a.points);
    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load points" },
      { status: 500 }
    );
  }
}
