// Server-only data access for the accountability tracker. Uses Supabase when
// configured, otherwise serves demo data for reads and refuses writes (same
// convention as the ATS). Never import this from client code.

import { createServerClient } from "@/lib/supabase/server";
import { DEMO_MEMBERS, DEMO_PROJECT, DEMO_RATINGS } from "./demo";
import { currentWeek, weekToRemind } from "./week";
import {
  CATEGORY_KEYS,
  weekCompletion,
  type CategoryKey,
  type Project,
  type ProjectMember,
  type Rating,
  type RatingInput,
  type RatingRow,
  type Seat,
} from "./types";

// Reuses the shared client from the strike_system foundation — we do NOT define
// our own. Returns null when Supabase env is absent → the tracker runs on demo
// data and writes are disabled.
function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

export type WriteResult = { ok: boolean; demo?: boolean; saved?: number; error?: string };

// PostgREST returns an embedded to-one relation as an object, but its generated
// types widen it to object|array. One narrowing helper beats casting at every
// call site.
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// ── Projects a viewer can open ───────────────────────────────────────────────

export type ViewerProject = Project & {
  /** The viewer's seat on this project; null for exec, who sit on none. */
  seat: Seat | null;
};

/**
 * Every project this member may open. Exec gets all active projects; everyone
 * else gets only the ones they hold a PM/SC seat on. A consultant's projects are
 * deliberately absent — they never see the grid.
 */
export async function getViewerProjects(
  memberId: string,
  role: string
): Promise<{ projects: ViewerProject[]; demo: boolean }> {
  const sb = db();
  if (!sb) {
    return { projects: [{ ...DEMO_PROJECT, seat: "project_manager" }], demo: true };
  }

  if (role === "exec") {
    const { data, error } = await sb
      .from("projects")
      .select("*")
      .eq("active", true)
      .order("name");
    if (error) throw error;
    return { projects: (data ?? []).map((p) => ({ ...(p as Project), seat: null })), demo: false };
  }

  const { data, error } = await sb
    .from("project_members")
    .select("seat, project:project_id ( * )")
    .eq("member_id", memberId)
    .in("seat", ["project_manager", "senior_consultant"]);
  if (error) throw error;

  const projects: ViewerProject[] = [];
  for (const row of data ?? []) {
    const project = one<Project>(row.project as unknown as Project | Project[]);
    if (project && project.active) projects.push({ ...project, seat: row.seat as Seat });
  }
  projects.sort((a, b) => a.name.localeCompare(b.name));

  return { projects, demo: false };
}

/** The viewer's seat on one project, or null if they aren't on it. */
export async function getSeat(projectId: string, memberId: string): Promise<Seat | null> {
  const sb = db();
  if (!sb) return projectId === DEMO_PROJECT.id ? "project_manager" : null;

  const { data } = await sb
    .from("project_members")
    .select("seat")
    .eq("project_id", projectId)
    .eq("member_id", memberId)
    .maybeSingle();

  return (data?.seat as Seat) ?? null;
}

// ── One project's grid ───────────────────────────────────────────────────────

export type ProjectGrid = {
  project: Project;
  /** Consultants only — the people rated, in roster order. */
  consultants: ProjectMember[];
  /** The PM/SC who fill this grid, shown so exec knows who to chase. */
  raters: ProjectMember[];
  /** Ratings for the requested week only. */
  ratings: RatingRow[];
  week: number;
  currentWeek: number;
  demo: boolean;
};

export async function getProjectGrid(projectId: string, week?: number): Promise<ProjectGrid | null> {
  const sb = db();

  if (!sb) {
    const cw = currentWeek(DEMO_PROJECT.starts_on, DEMO_PROJECT.weeks) || 1;
    const w = week ?? cw;
    return {
      project: DEMO_PROJECT,
      consultants: DEMO_MEMBERS.filter((m) => m.seat === "consultant"),
      raters: DEMO_MEMBERS.filter((m) => m.seat !== "consultant"),
      ratings: DEMO_RATINGS.filter((r) => r.week === w),
      week: w,
      currentWeek: cw,
      demo: true,
    };
  }

  const { data: project } = await sb.from("projects").select("*").eq("id", projectId).single();
  if (!project) return null;

  const cw = currentWeek(project.starts_on, project.weeks) || 1;
  const w = clampWeek(week ?? cw, project.weeks);

  const [{ data: roster }, { data: ratings }] = await Promise.all([
    sb
      .from("project_members")
      .select("member_id, seat, member:member_id ( full_name, email )")
      .eq("project_id", projectId),
    sb
      .from("accountability_ratings")
      .select("member_id, week, category, rating, note, rated_by, updated_at, rater:rated_by ( full_name )")
      .eq("project_id", projectId)
      .eq("week", w),
  ]);

  const people: ProjectMember[] = (roster ?? [])
    .map((r) => {
      const m = one<{ full_name: string | null; email: string }>(
        r.member as unknown as { full_name: string | null; email: string }
      );
      return {
        member_id: r.member_id as string,
        full_name: m?.full_name ?? m?.email ?? "Unknown member",
        email: m?.email ?? "",
        seat: r.seat as Seat,
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return {
    project: project as Project,
    consultants: people.filter((p) => p.seat === "consultant"),
    raters: people.filter((p) => p.seat !== "consultant"),
    ratings: (ratings ?? []).map((r) => ({
      member_id: r.member_id as string,
      week: r.week as number,
      category: r.category as CategoryKey,
      rating: r.rating as Rating,
      note: (r.note as string | null) ?? null,
      rated_by: (r.rated_by as string | null) ?? null,
      rated_by_name:
        one<{ full_name: string | null }>(r.rater as unknown as { full_name: string | null })
          ?.full_name ?? null,
      updated_at: r.updated_at as string,
    })),
    week: w,
    currentWeek: cw,
    demo: false,
  };
}

function clampWeek(week: number, max: number): number {
  if (!Number.isFinite(week)) return 1;
  return Math.min(Math.max(Math.trunc(week), 1), max);
}

// ── Writing ratings ──────────────────────────────────────────────────────────

/**
 * Upsert a batch of cells for one (project, week).
 *
 * The grid autosaves, so this is called with whatever changed since the last
 * save — usually one or two cells. The unique key `(project, member, week,
 * category)` makes every save idempotent, and `rated_by` is overwritten so the
 * cell always shows who last touched it.
 *
 * Inputs are filtered against the CURRENT roster: a member removed from the
 * project mid-week can't be rated by a stale open tab.
 */
export async function saveRatings(args: {
  projectId: string;
  week: number;
  inputs: RatingInput[];
  ratedBy: string;
}): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true, error: "Supabase not configured — nothing was saved." };

  const { data: project } = await sb
    .from("projects")
    .select("weeks")
    .eq("id", args.projectId)
    .single();
  if (!project) return { ok: false, error: "Project not found" };
  if (args.week < 1 || args.week > project.weeks) {
    return { ok: false, error: `Week must be between 1 and ${project.weeks}` };
  }

  const { data: roster } = await sb
    .from("project_members")
    .select("member_id")
    .eq("project_id", args.projectId)
    .eq("seat", "consultant");
  const rateable = new Set((roster ?? []).map((r) => r.member_id as string));

  const rows = args.inputs
    .filter((i) => rateable.has(i.member_id))
    .map((i) => ({
      project_id: args.projectId,
      member_id: i.member_id,
      week: args.week,
      category: i.category,
      rating: i.rating,
      // "" clears a note; undefined leaves the column null on insert.
      note: i.note?.trim() ? i.note.trim() : null,
      rated_by: args.ratedBy,
    }));

  if (rows.length === 0) {
    return { ok: false, error: "No rateable consultants in this request" };
  }

  const { error } = await sb
    .from("accountability_ratings")
    .upsert(rows, { onConflict: "project_id,member_id,week,category" });

  if (error) return { ok: false, error: error.message };
  return { ok: true, saved: rows.length };
}

// ── Exec overview ────────────────────────────────────────────────────────────

export type ProjectSummary = {
  project: Project;
  raters: ProjectMember[];
  consultantCount: number;
  currentWeek: number;
  /** Completion of the current week. */
  filled: number;
  total: number;
  complete: boolean;
  /** Weeks that began but were never fully filled — the real compliance signal. */
  missedWeeks: number[];
  /** Below ratings across the whole semester, newest first. */
  concerns: {
    member_id: string;
    full_name: string;
    week: number;
    category: CategoryKey;
    note: string | null;
  }[];
};

/**
 * Every active project with its completion and its Below ratings. One pass over
 * the cohort's data rather than a query per project — at club scale (a dozen
 * projects × 12 weeks × ~5 consultants) that is a few thousand rows.
 */
export async function getOverview(today: Date = new Date()): Promise<{
  summaries: ProjectSummary[];
  demo: boolean;
}> {
  const sb = db();
  if (!sb) {
    const cw = currentWeek(DEMO_PROJECT.starts_on, DEMO_PROJECT.weeks) || 1;
    const consultants = DEMO_MEMBERS.filter((m) => m.seat === "consultant");
    const { filled, total, complete } = weekCompletion(consultants, DEMO_RATINGS, cw);
    return {
      demo: true,
      summaries: [
        {
          project: DEMO_PROJECT,
          raters: DEMO_MEMBERS.filter((m) => m.seat !== "consultant"),
          consultantCount: consultants.length,
          currentWeek: cw,
          filled,
          total,
          complete,
          missedWeeks: [],
          concerns: DEMO_RATINGS.filter((r) => r.rating === "below").map((r) => ({
            member_id: r.member_id,
            full_name: DEMO_MEMBERS.find((m) => m.member_id === r.member_id)?.full_name ?? "—",
            week: r.week,
            category: r.category,
            note: r.note,
          })),
        },
      ],
    };
  }

  const [{ data: projects }, { data: roster }, { data: ratings }] = await Promise.all([
    sb.from("projects").select("*").eq("active", true).order("name"),
    sb.from("project_members").select("project_id, member_id, seat, member:member_id ( full_name, email )"),
    sb.from("accountability_ratings").select("project_id, member_id, week, category, rating, note"),
  ]);

  const summaries = (projects ?? []).map((p) => {
    const project = p as Project;
    const people = (roster ?? [])
      .filter((r) => r.project_id === project.id)
      .map((r) => {
        const m = one<{ full_name: string | null; email: string }>(
          r.member as unknown as { full_name: string | null; email: string }
        );
        return {
          member_id: r.member_id as string,
          full_name: m?.full_name ?? m?.email ?? "Unknown member",
          email: m?.email ?? "",
          seat: r.seat as Seat,
        };
      });

    const consultants = people.filter((x) => x.seat === "consultant");
    const mine = (ratings ?? []).filter((r) => r.project_id === project.id) as unknown as Pick<
      RatingRow,
      "member_id" | "category" | "week" | "rating" | "note"
    >[];
    const cw = currentWeek(project.starts_on, project.weeks, today);
    const effectiveWeek = cw || 1;
    const { filled, total, complete } = weekCompletion(consultants, mine, effectiveWeek);

    // Only weeks that have fully elapsed count as "missed" — the week in flight
    // is merely unfinished, and flagging it would cry wolf every Monday.
    //
    // A project with no consultants is skipped entirely: `weekCompletion` reports
    // an empty roster as incomplete (there is no work to be done, but none was
    // done either), so without this guard a project awaiting its roster would
    // accuse its PM of missing every week that had gone by.
    const missedWeeks: number[] = [];
    if (consultants.length > 0) {
      for (let w = 1; w < cw; w++) {
        if (!weekCompletion(consultants, mine, w).complete) missedWeeks.push(w);
      }
    }

    const concerns = mine
      .filter((r) => r.rating === "below")
      .sort((a, b) => b.week - a.week)
      .map((r) => ({
        member_id: r.member_id,
        full_name: people.find((x) => x.member_id === r.member_id)?.full_name ?? "—",
        week: r.week,
        category: r.category,
        note: r.note,
      }));

    return {
      project,
      raters: people.filter((x) => x.seat !== "consultant"),
      consultantCount: consultants.length,
      currentWeek: effectiveWeek,
      filled,
      total,
      complete,
      missedWeeks,
      concerns,
    };
  });

  return { summaries, demo: false };
}

// ── Reminder job ─────────────────────────────────────────────────────────────

export type ReminderTarget = {
  project: Project;
  week: number;
  filled: number;
  total: number;
  recipients: { member_id: string; full_name: string; email: string }[];
};

/**
 * Who still owes a rating this week, minus anyone already emailed for that
 * (project, week). Returns nothing for projects that are complete, not yet
 * started, finished, or have no consultants to rate.
 */
export async function getReminderTargets(today: Date = new Date()): Promise<ReminderTarget[]> {
  const sb = db();
  if (!sb) return [];

  const [{ data: projects }, { data: roster }, { data: ratings }, { data: sent }] =
    await Promise.all([
      sb.from("projects").select("*").eq("active", true),
      sb.from("project_members").select("project_id, member_id, seat, member:member_id ( full_name, email )"),
      sb.from("accountability_ratings").select("project_id, member_id, week, category"),
      sb.from("accountability_reminders").select("project_id, week, recipient_id"),
    ]);

  const alreadySent = new Set(
    (sent ?? []).map((s) => `${s.project_id}:${s.week}:${s.recipient_id}`)
  );

  const targets: ReminderTarget[] = [];

  for (const p of projects ?? []) {
    const project = p as Project;
    const week = weekToRemind(project.starts_on, project.weeks, today);
    if (week === null) continue;

    const people = (roster ?? []).filter((r) => r.project_id === project.id);
    const consultants = people
      .filter((r) => r.seat === "consultant")
      .map((r) => ({ member_id: r.member_id as string }));
    if (consultants.length === 0) continue;

    const mine = (ratings ?? []).filter((r) => r.project_id === project.id) as unknown as Pick<
      RatingRow,
      "member_id" | "category" | "week"
    >[];
    const { filled, total, complete } = weekCompletion(consultants, mine, week);
    if (complete) continue;

    const recipients = people
      .filter((r) => r.seat === "project_manager" || r.seat === "senior_consultant")
      .map((r) => {
        const m = one<{ full_name: string | null; email: string }>(
          r.member as unknown as { full_name: string | null; email: string }
        );
        return {
          member_id: r.member_id as string,
          full_name: m?.full_name ?? "there",
          email: m?.email ?? "",
        };
      })
      .filter((r) => r.email && !alreadySent.has(`${project.id}:${week}:${r.member_id}`));

    if (recipients.length === 0) continue;
    targets.push({ project, week, filled, total, recipients });
  }

  return targets;
}

/** Record that a reminder went out, so a retry or re-run cannot re-nag. */
export async function markReminded(
  projectId: string,
  week: number,
  recipientIds: string[]
): Promise<void> {
  const sb = db();
  if (!sb || recipientIds.length === 0) return;
  await sb.from("accountability_reminders").upsert(
    recipientIds.map((recipient_id) => ({ project_id: projectId, week, recipient_id })),
    { onConflict: "project_id,week,recipient_id" }
  );
}

export { CATEGORY_KEYS };
