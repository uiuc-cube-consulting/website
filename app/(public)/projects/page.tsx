import type { Metadata } from "next";
import { ProjectShowcase } from "@/components/ProjectShowcase";
import { ClientCarousel } from "@/components/ClientCarousel";
import { PageHero } from "@/components/PageHero";
import { PROJECTS, CLIENT_LOGOS } from "@/lib/content";

export const metadata: Metadata = {
  title: "Projects",
  description: "A selection of recent CUBE Consulting client engagements.",
};

export default function ProjectsPage() {
  return (
    <>
      <PageHero
        eyebrow="Spring 2026"
        title="Our Projects."
        blurb="Every semester our teams partner with founders, operators, and engineering leaders to ship deliverables that move their business forward. Here&rsquo;s a snapshot of what we&rsquo;re building this term."
      />

      <section className="section-y bg-[var(--bg-cream)]/40">
        <div className="container-x">
          <p className="eyebrow text-center">Spring 2026</p>
          <h2 className="mt-3 text-center font-display font-extrabold text-[var(--gold-deep)] text-4xl md:text-5xl">
            Spring 2026
          </h2>
          <div className="mt-14 grid md:grid-cols-2 gap-6 md:gap-8">
            {PROJECTS.map((p) => (
              <ProjectShowcase key={p.name} project={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="container-x section-y">
          <p className="eyebrow text-center">Recent Clients</p>
          <h2 className="mt-3 text-center font-display font-extrabold text-[var(--bg-dark)] text-3xl md:text-4xl">
            Companies we&apos;ve worked with.
          </h2>
          <div className="mt-10 px-4 md:px-6">
            <ClientCarousel items={CLIENT_LOGOS} />
          </div>
        </div>
      </section>
    </>
  );
}
