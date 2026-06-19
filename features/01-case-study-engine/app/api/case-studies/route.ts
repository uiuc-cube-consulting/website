import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  filterCaseStudies,
  getCaseStudies,
  getFacets,
  type SortKey,
} from "@/features/01-case-study-engine/lib/case-studies";

// Members-only JSON endpoint for the case-study library. Auth-gated (mirrors
// app/api/points/route.ts) because the dataset includes real client names that
// may be under NDA — it must never be reachable by the public.
//
// Query params (all optional):
//   q     — free-text search
//   area  — practice area; repeatable (?area=Strategy%20%26%20Research&area=Software%20%26%20Data)
//   term  — term label, e.g. "Spring 2024"
//   sort  — "newest" (default) | "oldest" | "az"

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const query = sp.get("q") ?? "";
  const areas = sp.getAll("area");
  const term = sp.get("term") ?? "all";
  const sort = (sp.get("sort") as SortKey) ?? "newest";

  const all = getCaseStudies();
  const studies = filterCaseStudies(all, { query, areas, term, sort });

  return NextResponse.json({
    count: studies.length,
    total: all.length,
    facets: getFacets(all),
    studies,
  });
}
