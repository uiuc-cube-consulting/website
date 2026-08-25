import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getProjectGrid,
  getSeat,
  getViewerProjects,
  saveRatings,
} from "@/features/05-accountability-tracker/lib/store";
import {
  canAccessTracker,
  canRateProject,
  canViewProject,
  isExec,
} from "@/features/05-accountability-tracker/lib/access";
import { isCategory, isRating, type RatingInput } from "@/features/05-accountability-tracker/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET  /api/accountability                    → the projects this viewer may open
 * GET  /api/accountability?project_id=&week=  → one project's grid for one week
 *
 * Reading is gated on the same seat that gates writing: a consultant never sees
 * the grid, not even their own row.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewer = { memberId: session.user.memberId, role: session.user.role };
  if (!canAccessTracker(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const projectId = params.get("project_id");

  if (!projectId) {
    const { projects, demo } = await getViewerProjects(viewer.memberId, viewer.role);
    return NextResponse.json({ projects, demo });
  }

  const seat = isExec(viewer) ? null : await getSeat(projectId, viewer.memberId);
  if (!canViewProject(viewer, seat)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const weekParam = params.get("week");
  const week = weekParam ? Number(weekParam) : undefined;
  if (weekParam && !Number.isFinite(week)) {
    return NextResponse.json({ error: "Invalid week" }, { status: 400 });
  }

  const grid = await getProjectGrid(projectId, week);
  if (!grid) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({ ...grid, seat, canRate: canRateProject(viewer, seat) });
}

/**
 * POST /api/accountability
 * body: { project_id, week, ratings: [{ member_id, category, rating, note? }] }
 *
 * The grid autosaves, so a body is usually one or two cells. Every cell is an
 * upsert keyed on (project, member, week, category), which makes a duplicate
 * save from a retry harmless.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const viewer = { memberId: session.user.memberId, role: session.user.role };
  if (!canAccessTracker(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { project_id?: string; week?: number; ratings?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id: projectId, week } = body;
  if (!projectId) return NextResponse.json({ error: "project_id required" }, { status: 400 });
  if (!Number.isInteger(week)) {
    return NextResponse.json({ error: "week must be an integer" }, { status: 400 });
  }

  const seat = isExec(viewer) ? null : await getSeat(projectId, viewer.memberId);
  if (!canRateProject(viewer, seat)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!Array.isArray(body.ratings) || body.ratings.length === 0) {
    return NextResponse.json({ error: "ratings must be a non-empty array" }, { status: 400 });
  }

  // Validate every cell before writing any of them — a partial batch would be
  // worse than a rejected one, since the client would show some cells saved.
  const inputs: RatingInput[] = [];
  for (const raw of body.ratings) {
    const cell = raw as Record<string, unknown>;
    if (typeof cell.member_id !== "string" || !cell.member_id) {
      return NextResponse.json({ error: "Each rating needs a member_id" }, { status: 400 });
    }
    if (!isCategory(cell.category)) {
      return NextResponse.json({ error: `Unknown category "${String(cell.category)}"` }, { status: 400 });
    }
    if (!isRating(cell.rating)) {
      return NextResponse.json({ error: `Unknown rating "${String(cell.rating)}"` }, { status: 400 });
    }
    if (cell.note !== undefined && cell.note !== null && typeof cell.note !== "string") {
      return NextResponse.json({ error: "note must be a string" }, { status: 400 });
    }
    inputs.push({
      member_id: cell.member_id,
      category: cell.category,
      rating: cell.rating,
      note: (cell.note as string | null | undefined) ?? undefined,
    });
  }

  const result = await saveRatings({
    projectId,
    week: week as number,
    inputs,
    ratedBy: viewer.memberId,
  });

  if (result.demo) {
    return NextResponse.json({ ok: false, demo: true, error: result.error });
  }
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, saved: result.saved });
}
