import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Trophy, FolderOpen, Mail } from "lucide-react";
import { CalendarEmbed } from "@/components/portal/CalendarEmbed";
import { PointsLookup } from "@/components/portal/PointsLookup";
import { ResourcesGrid } from "@/components/portal/ResourcesGrid";
import { PORTAL_RESOURCES, SITE } from "@/lib/content";

const QUICK_LINKS = [
  {
    icon: CalendarDays,
    label: "What's this week",
    href: "#calendar",
    blurb: "Events, deadlines, socials.",
  },
  {
    icon: Trophy,
    label: "Your standing",
    href: "#points",
    blurb: "Track points and attendance.",
  },
  {
    icon: FolderOpen,
    label: "Templates & SOPs",
    href: "#resources",
    blurb: "Decks, forms, handbooks.",
  },
];

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
          <p className="mt-3 text-[var(--muted)] max-w-xl">
            Everything you need for the semester, in one place. Jump straight to a section below.
          </p>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Signed in as <span className="font-medium text-[var(--bg-dark)]">{session.user.email}</span>
        </p>
      </div>

      <nav aria-label="Quick links" className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {QUICK_LINKS.map((q) => {
          const Icon = q.icon;
          return (
            <Link
              key={q.label}
              href={q.href}
              className="group rounded-2xl border border-[var(--border)] bg-white p-5 hover:border-[var(--gold)] hover:shadow-md transition-all flex items-start gap-4"
            >
              <span className="grid place-items-center w-10 h-10 rounded-xl bg-[var(--bg-cream)] text-[var(--gold-deep)] group-hover:bg-[var(--gold)] group-hover:text-[var(--bg-dark)] transition-colors shrink-0">
                <Icon size={18} />
              </span>
              <div>
                <p className="font-display font-bold text-[var(--bg-dark)]">{q.label}</p>
                <p className="mt-0.5 text-[13px] text-[var(--muted)] leading-relaxed">
                  {q.blurb}
                </p>
              </div>
            </Link>
          );
        })}
      </nav>

      <section id="calendar" className="mt-16 scroll-mt-24">
        <SectionHeader eyebrow="Upcoming" title="Calendar" />
        <p className="mt-3 text-[var(--muted)] max-w-2xl">
          GMs, project checkpoints, and socials. All times Central.
        </p>
        <div className="mt-6">
          <CalendarEmbed />
        </div>
      </section>

      <section id="points" className="mt-16 scroll-mt-24">
        <SectionHeader eyebrow="Track your standing" title="Points tracker" />
        <p className="mt-3 text-[var(--muted)] max-w-2xl">
          Search by name to see your current point total. Updated weekly from the master sheet.
        </p>
        <div className="mt-6">
          <PointsLookup />
        </div>
      </section>

      <section id="resources" className="mt-16 scroll-mt-24">
        <SectionHeader eyebrow="Toolkit" title="Resources" />
        <p className="mt-3 text-[var(--muted)] max-w-2xl">
          Templates, handbooks, and forms grouped by what you&rsquo;ll use them for.
        </p>
        <div className="mt-8">
          <ResourcesGrid items={PORTAL_RESOURCES} />
        </div>
      </section>

      <section className="mt-16 rounded-2xl border border-[var(--border)] bg-white p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--bg-cream)] text-[var(--gold-deep)] shrink-0">
            <Mail size={20} />
          </span>
          <div>
            <p className="font-display font-bold text-[var(--bg-dark)]">Need something not listed?</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Reach out to the exec board — we&rsquo;ll point you to the right person or resource.
            </p>
          </div>
        </div>
        <a href={`mailto:${SITE.email}`} className="btn btn-gold text-xs px-4 py-2 self-start md:self-auto">
          Email the board
        </a>
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
