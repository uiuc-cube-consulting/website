import Link from "next/link";
import { Hero } from "@/components/Hero";
import { StatsBar } from "@/components/StatsBar";
import Image from "next/image";
import { Testimonials } from "@/components/Testimonials";
import { AlumniConstellation } from "@/components/AlumniConstellation";
import { CTABand } from "@/components/CTABand";
import { HiringStatement } from "@/components/HiringStatement";
import { AboutEditorial } from "@/components/AboutEditorial";
import { PROJECTS } from "@/lib/content";

/**
 * Homepage section order is deliberate and split by audience:
 *   Hero        -> both paths, client CTA primary
 *   Stats       -> scale, for either reader
 *   About       -> what CUBE is (absorbed the old FeatureSplit)
 *   Who we hire -> answers "am I eligible?" and breaks the section
 *   This term   -> client proof
 *   Testimonials-> client proof
 *   Alumni      -> applicant proof
 *   CTA         -> both paths again
 *
 * Removed from the old 10-section build: FeatureSplit (said the same thing as
 * AboutEditorial), PillarsFlow (lives on /about), PhotoGallery (lives on
 * /join-us, where applicants are), and the Affiliations strip (already in the
 * footer).
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsBar />

      <div id="what-we-do">
        <AboutEditorial />
      </div>

      <HiringStatement />

      <section className="section-y bg-[var(--bg-cream)]/40">
        <div className="container-x">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div className="max-w-2xl">
              <p className="eyebrow">This semester</p>
              <h2 className="mt-4 font-display font-extrabold text-[var(--bg-dark)] text-4xl md:text-5xl leading-[1.05]">
                Seven teams, seven clients.
              </h2>
              <p className="mt-5 text-[var(--muted)] text-[17px] leading-relaxed">
                Every engagement runs the full UIUC semester, from kickoff to final
                delivery.
              </p>
            </div>
            <Link href="/projects" className="btn btn-purple-outline">
              See the work
            </Link>
          </div>
          {/* All seven read at once -- a marquee would show three and make you
              wait for the rest. */}
          <ul className="mt-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {PROJECTS.map((project) => (
              <li
                key={project.name}
                className="grid place-items-center h-24 md:h-28 rounded-2xl bg-white border border-[var(--border)] px-6 transition-colors hover:border-[var(--brand)]"
              >
                {project.logo ? (
                  <div className="relative w-full h-10 md:h-12">
                    <Image
                      src={project.logo}
                      alt={project.name}
                      fill
                      sizes="(min-width:1024px) 16rem, (min-width:640px) 24vw, 40vw"
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <span className="font-display font-extrabold text-lg text-[var(--bg-dark)]">
                    {project.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Testimonials />

      <AlumniConstellation />

      <CTABand
        title="Two ways to work with CUBE."
        blurb={
          <>
            Hire a team for your next engagement, or apply to join ours. Both start
            with a conversation.
          </>
        }
      >
        <Link href="/contact" className="btn btn-gold">Become a client</Link>
        <Link href="/join-us" className="btn btn-light-outline">Join the team</Link>
      </CTABand>
    </>
  );
}
