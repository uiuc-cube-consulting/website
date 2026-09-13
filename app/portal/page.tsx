import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Trophy, FolderOpen, Mail, Camera, ClipboardCheck } from "lucide-react";
import { CalendarEmbed } from "@/components/portal/CalendarEmbed";
import { PointsLookup } from "@/components/portal/PointsLookup";
import { PointSubmissions } from "@/components/portal/PointSubmissions";
import { ResourcesGrid } from "@/components/portal/ResourcesGrid";
import { PORTAL_RESOURCES, SITE } from "@/lib/content";
import { countPendingSubmissions } from "@/lib/point-submissions-store";
import { AnonymousNoteDialog } from "@/features/06-portal-feedback/components/AnonymousNoteDialog";
import { anonymousRecipients } from "@/features/06-portal-feedback/lib/anonymous-email";

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
    icon: Camera,
    label: "Submit points",
    href: "#submit-points",
    blurb: "Log an event with a photo.",
  },
  {
    icon: FolderOpen,
    label: "Templates & SOPs",
    href: "#resources",
    blurb: "Decks, forms, handbooks.",
  },
];

// Exec aren't on the points board, so they have nothing to submit. Their card
// in the same slot goes to the review queue instead.
const REVIEW_POINTS_LINK = {
  icon: ClipboardCheck,
  label: "Review points",
  href: "/portal/points/review",
  blurb: "Approve member submissions.",
};

export default async function PortalDashboard() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");

  const firstName = session.user.name?.split(/\s+/)[0] ?? "consultant";
  const isExec = session.user.role === "exec";
  const quickLinks = isExec
    ? QUICK_LINKS.map((q) => (q.href === "#submit-points" ? REVIEW_POINTS_LINK : q))
    : QUICK_LINKS;
  // Null when db/point-submissions.sql hasn't been run yet.
  const pendingPoints = isExec ? await countPendingSubmissions() : null;

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

      <nav aria-label="Quick links" className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {quickLinks.map((q) => {
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
          Search by name to see a point total. Approved point submissions are added here automatically.
        </p>
        <div className="mt-6">
          <PointsLookup />
        </div>
      </section>

      <section id="submit-points" className="mt-16 scroll-mt-24">
        <SectionHeader
          eyebrow={isExec ? "Exec review" : "Earn points"}
          title={isExec ? "Point submissions" : "Submit points"}
        />
        {isExec ? (
          <div className="mt-6 rounded-2xl border border-[var(--border)] bg-white p-6 md:p-7 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--bg-cream)] text-[var(--gold-deep)] shrink-0">
                <ClipboardCheck size={20} />
              </span>
              <div>
                <p className="font-display font-bold text-[var(--bg-dark)]">
                  {pendingPoints === null
                    ? "Review queue"
                    : pendingPoints === 0
                      ? "Nothing waiting for review"
                      : `${pendingPoints} ${pendingPoints === 1 ? "submission" : "submissions"} waiting for review`}
                </p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  {pendingPoints === null
                    ? "Run db/point-submissions.sql in Supabase to turn on member submissions."
                    : "Members submit events with a photo. Approving adds the points to their total."}
                </p>
              </div>
            </div>
            <Link href="/portal/points/review" className="btn btn-gold text-xs px-4 py-2 self-start md:self-auto">
              Open review queue
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[var(--muted)] max-w-2xl">
              Log a fundamentals, professional, or social event with a photo of you there. Points count once exec
              approve them.
            </p>
            <div className="mt-6">
              <PointSubmissions />
            </div>
          </>
        )}
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
              Or send something without your name on it.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* The two ways to reach exec, side by side, because the choice
              between them is the point: one is a normal email from you, the
              other arrives with nothing on it that says who sent it. */}
          <a href={`mailto:${SITE.email}`} className="btn btn-gold text-xs px-4 py-2">
            Email the board
          </a>
          <AnonymousNoteDialog recipients={anonymousRecipients()} />
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
