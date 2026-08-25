import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Users } from "lucide-react";
import { auth } from "@/auth";
import {
  getOverview,
  getProjectGrid,
  getSeat,
  getViewerProjects,
} from "@/features/05-accountability-tracker/lib/store";
import {
  canAccessTracker,
  canRateProject,
  isExec,
} from "@/features/05-accountability-tracker/lib/access";
import { SEAT_LABEL } from "@/features/05-accountability-tracker/lib/types";
import { RatingGrid } from "@/features/05-accountability-tracker/components/RatingGrid";
import { ExecOverview } from "@/features/05-accountability-tracker/components/ExecOverview";
import { RemindButton } from "@/features/05-accountability-tracker/components/RemindButton";

export const metadata: Metadata = {
  title: "Accountability · Member Portal",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ project?: string; week?: string }>;

export default async function AccountabilityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/portal/sign-in");

  const viewer = { memberId: session.user.memberId, role: session.user.role };
  // proxy.ts already gates the route; this is the second lock, so a direct hit
  // can't get through if the matcher is ever loosened.
  if (!canAccessTracker(viewer)) redirect("/portal");

  const { project: projectId, week: weekParam } = await searchParams;
  const { projects, demo } = await getViewerProjects(viewer.memberId, viewer.role);
  const exec = isExec(viewer);

  // Exec lands on the cross-project board; a PM/SC with exactly one project
  // skips straight into it, which is the common case and saves a click.
  const selectedId = projectId ?? (!exec && projects.length === 1 ? projects[0].id : undefined);

  if (!selectedId) {
    return (
      <div className="container-x py-10 md:py-14">
        <Header exec={exec} />
        {exec ? <ExecBoard /> : <ProjectChooser projects={projects} />}
      </div>
    );
  }

  const seat = exec ? null : await getSeat(selectedId, viewer.memberId);
  if (!exec && seat === null) redirect("/portal/accountability");

  const week = weekParam ? Number(weekParam) : undefined;
  const grid = await getProjectGrid(selectedId, Number.isFinite(week) ? week : undefined);
  if (!grid) redirect("/portal/accountability");

  const showBackLink = exec || projects.length > 1;

  return (
    <div className="container-x py-10 md:py-14">
      {showBackLink && (
        <Link
          href="/portal/accountability"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--bg-dark)] mb-6 transition-colors"
        >
          <ChevronLeft size={16} />
          {exec ? "All projects" : "Your projects"}
        </Link>
      )}

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-8">
        <div>
          <p className="eyebrow">Accountability check-in</p>
          <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
            {grid.project.name}
          </h1>
          <p className="mt-3 text-[var(--muted)] max-w-xl">
            Rate each consultant on the three categories. It saves as you click — there is no
            submit button.
          </p>
        </div>
        {grid.raters.length > 0 && (
          <p className="text-sm text-[var(--muted)]">
            Filled by{" "}
            <span className="font-medium text-[var(--bg-dark)]">
              {grid.raters.map((r) => r.full_name).join(" & ")}
            </span>
          </p>
        )}
      </div>

      <RatingGrid
        project={grid.project}
        consultants={grid.consultants}
        ratings={grid.ratings}
        week={grid.week}
        currentWeek={grid.currentWeek}
        canRate={canRateProject(viewer, seat)}
        demo={grid.demo || demo}
      />
    </div>
  );
}

function Header({ exec }: { exec: boolean }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
      <div>
        <p className="eyebrow">Quality assurance</p>
        <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
          Accountability
        </h1>
        <p className="mt-3 text-[var(--muted)] max-w-xl">
          {exec
            ? "Weekly consultant ratings from every project's PM and SC. Below ratings are surfaced first."
            : "A weekly check-in on each consultant you lead. Two minutes, once a week."}
        </p>
      </div>
      {exec && <RemindButton />}
    </div>
  );
}

async function ExecBoard() {
  const { summaries } = await getOverview();
  return <ExecOverview summaries={summaries} />;
}

function ProjectChooser({
  projects,
}: {
  projects: { id: string; name: string; client: string | null; seat: string | null }[];
}) {
  if (projects.length === 0) {
    return (
      <p className="rounded-2xl border border-[var(--border)] bg-white px-5 py-10 text-center text-sm text-[var(--muted)]">
        You&rsquo;re not listed as PM or SC on any active project. If that&rsquo;s wrong, ask exec
        to add you to the project roster.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {projects.map((p) => (
        <Link
          key={p.id}
          href={`/portal/accountability?project=${p.id}`}
          className="group rounded-2xl border border-[var(--border)] bg-white p-5 hover:border-[var(--gold)] hover:shadow-md transition-all"
        >
          <p className="font-display font-bold text-[var(--bg-dark)]">{p.name}</p>
          <p className="mt-1 text-xs text-[var(--muted)] flex items-center gap-1.5">
            <Users size={12} />
            You&rsquo;re the {SEAT_LABEL[(p.seat as keyof typeof SEAT_LABEL) ?? "consultant"]}
          </p>
        </Link>
      ))}
    </div>
  );
}
