import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Hero } from "@/components/Hero";
import { StatsBar } from "@/components/StatsBar";
import { PillarCard } from "@/components/PillarCard";
import { LogoStrip } from "@/components/LogoStrip";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Testimonials } from "@/components/Testimonials";
import { HOME_FEATURE_CARDS, PILLARS, SITE, PARTNER_LOGOS } from "@/lib/content";

const HOME_GALLERY = [
  { src: "/scraped/join-us/1ae7010d6f.jpg", alt: "CUBE team event" },
  { src: "/scraped/join-us/4c7f97f6f7.jpg", alt: "Consultants collaborating" },
  { src: "/scraped/join-us/710b9f81ae.jpg", alt: "Members on campus" },
  { src: "/scraped/join-us/bd70808e04.jpg", alt: "Team gathering" },
  { src: "/scraped/join-us/c1aa3bd3ef.jpg", alt: "CUBE retreat" },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsBar />

      <section className="section-y bg-white">
        <div className="container-x grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5">
            <p className="eyebrow">About {SITE.shortName}</p>
            <h2 className="mt-4 font-display font-extrabold text-[var(--bg-dark)] text-4xl md:text-5xl leading-[1.05]">
              {SITE.longName}
            </h2>
          </div>
          <div className="lg:col-span-7 text-[var(--muted)] text-[17px] leading-[1.75] space-y-4">
            <p>
              For over a decade, our consultants have built business and engineering solutions for
              clients across Champaign-Urbana, Chicagoland, and beyond. We&apos;re an
              interdisciplinary team of UIUC undergraduates who care about the craft of consulting
              and the people we work alongside.
            </p>
            <p>
              Every semester we ship deliverables that real clients put in front of customers,
              investors, and engineering teams — and every semester we recruit the next cohort
              who&apos;ll do the same.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-cream)]">
        <div className="container-x section-y grid md:grid-cols-2 gap-6 md:gap-8">
          {HOME_FEATURE_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group relative rounded-2xl bg-white border border-[var(--border)] p-8 md:p-10 hover:shadow-xl hover:border-[var(--gold)] transition-all"
            >
              <p className="eyebrow">Learn more</p>
              <h3 className="mt-3 font-display font-extrabold text-[var(--bg-dark)] text-3xl md:text-4xl">
                {card.title}
              </h3>
              <p className="mt-4 text-[var(--muted)] text-[16px] leading-relaxed">{card.blurb}</p>
              <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--bg-dark)] group-hover:gap-3 transition-all">
                Read more <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-y bg-white">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="eyebrow">Our mission</p>
            <h2 className="mt-4 font-display font-extrabold text-[var(--bg-dark)] text-4xl md:text-5xl leading-[1.05]">
              Four pillars guide everything we build.
            </h2>
          </div>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PILLARS.map((p) => <PillarCard key={p.key} pillar={p} />)}
          </div>
        </div>
      </section>

      <section className="section-y bg-[var(--bg-cream)]/40">
        <div className="container-x">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="eyebrow">Life at CUBE</p>
              <h2 className="mt-4 font-display font-extrabold text-[var(--bg-dark)] text-4xl md:text-5xl leading-[1.05]">
                More than projects.
              </h2>
              <p className="mt-4 text-[var(--muted)] max-w-xl">
                Game nights, retreats, formal dinners, intramurals — CUBE is the friend group as
                much as it is the consulting org.
              </p>
            </div>
            <Link href="/join-us" className="btn btn-gold-outline">
              See more
            </Link>
          </div>
          <div className="mt-10">
            <PhotoGallery images={HOME_GALLERY} />
          </div>
        </div>
      </section>

      <Testimonials />

      <LogoStrip title="Affiliations" items={PARTNER_LOGOS} />

      <section className="bg-[var(--bg-dark)] text-white">
        <div className="container-x section-y text-center">
          <h2 className="font-display font-extrabold text-4xl md:text-5xl leading-tight">
            Ready to work with us?
          </h2>
          <p className="mt-5 max-w-xl mx-auto text-[var(--fg-on-dark)]/75 text-[17px] leading-relaxed">
            Whether you&apos;re hiring CUBE for a project or applying to join the team, we&apos;d
            love to hear from you.
          </p>
          <div className="mt-9 flex flex-wrap gap-3 justify-center">
            <Link href="/contact" className="btn btn-gold">Become a client</Link>
            <Link href="/join-us" className="btn btn-gold-outline">Join the team</Link>
          </div>
        </div>
      </section>
    </>
  );
}
