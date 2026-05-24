import Link from "next/link";
import { Hero } from "@/components/Hero";
import { StatsBar } from "@/components/StatsBar";
import { PillarsFlow } from "@/components/PillarsFlow";
import { LogoStrip } from "@/components/LogoStrip";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Testimonials } from "@/components/Testimonials";
import { AlumniMarquee } from "@/components/AlumniMarquee";
import { CTABand } from "@/components/CTABand";
import { FeatureSplit } from "@/components/FeatureSplit";
import { AboutEditorial } from "@/components/AboutEditorial";
import { PARTNER_LOGOS } from "@/lib/content";

const HOME_GALLERY = [
  { src: "/scraped/join-us/img1.JPG", alt: "CUBE team event" },
  { src: "/scraped/join-us/img2.JPG", alt: "Consultants collaborating" },
  { src: "/scraped/join-us/img3.JPG", alt: "Members on campus" },
  { src: "/scraped/join-us/img4.JPG", alt: "Team gathering" },
  { src: "/scraped/join-us/img6.JPG", alt: "CUBE retreat" },
];

export default function HomePage() {
  return (
    <>
      <Hero />
      <StatsBar />

      <AboutEditorial />

      <FeatureSplit />

      <section className="section-y bg-white">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="eyebrow">Our mission</p>
            <h2 className="mt-4 font-display font-extrabold text-[var(--bg-dark)] text-4xl md:text-5xl leading-[1.05]">
              Four pillars guide everything we build.
            </h2>
          </div>
          <PillarsFlow />
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
                Game nights, retreats, formal dinners, intramurals. CUBE is the friend group as
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

      <AlumniMarquee />

      <LogoStrip title="Affiliations" items={PARTNER_LOGOS} />

      <CTABand
        title="Ready to work with us?"
        blurb={
          <>
            Whether you&apos;re hiring CUBE for a project or applying to join the team, we&apos;d
            love to hear from you.
          </>
        }
      >
        <Link href="/contact" className="btn btn-gold">Become a client</Link>
        <Link href="/join-us" className="btn btn-gold-outline">Join the team</Link>
      </CTABand>
    </>
  );
}
