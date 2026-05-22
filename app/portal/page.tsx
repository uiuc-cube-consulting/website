import { auth } from "@/types/auth";
import { redirect } from "next/navigation";
import { CalendarEmbed } from "@/components/portal/CalendarEmbed";
import { PointsLookup } from "@/components/portal/PointsLookup";
import { ResourcesGrid } from "@/components/portal/ResourcesGrid";
import { PORTAL_RESOURCES } from "@/lib/content";

export default async function PortalDashboard() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");

  const firstName = session.user.name?.split(/\s+/)[0] ?? "consultant";

  return (
    <div className="container-x py-10 md:py-14">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <p className="eyebrow">Member portal</p>
          <h1 className="mt-3 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
            Welcome back, {firstName}.
          </h1>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Signed in as <span className="font-medium text-[var(--bg-dark)]">{session.user.email}</span>
        </p>
      </div>

      <section id="calendar" className="mt-12 scroll-mt-24">
        <SectionHeader eyebrow="Upcoming" title="Calendar" />
        <div className="mt-6">
          <CalendarEmbed />
        </div>
      </section>

      <section id="points" className="mt-16 scroll-mt-24">
        <SectionHeader eyebrow="Track your standing" title="Points Tracker" />
        <div className="mt-6">
          <PointsLookup />
        </div>
      </section>

      <section id="resources" className="mt-16 scroll-mt-24">
        <SectionHeader eyebrow="Toolkit" title="Resources" />
        <p className="mt-3 text-[var(--muted)] max-w-2xl">
          Templates, handbooks, and forms you&apos;ll need throughout the semester.
        </p>
        <div className="mt-6">
          <ResourcesGrid items={PORTAL_RESOURCES} />
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-3">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 className="mt-2 font-display font-extrabold text-2xl md:text-3xl text-[var(--bg-dark)]">
          {title}
        </h2>
      </div>
    </div>
  );
}
