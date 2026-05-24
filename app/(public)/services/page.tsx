import type { Metadata } from "next";
import Link from "next/link";
import { CLIENT_LOGOS } from "@/lib/content";
import { ClientCarousel } from "@/components/ClientCarousel";
import { EngagementProcess } from "@/components/EngagementProcess";
import { ServicePractices } from "@/components/ServicePractices";
import { Testimonials } from "@/components/Testimonials";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Business, engineering, and design services delivered by CUBE Consulting at UIUC.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="What we do"
        title="Clients and Services."
        blurb="Over the past decade we&rsquo;ve delivered more than two hundred engagements across retail, healthcare, energy, robotics, and software. Three core practice areas anchor our work."
      />

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

      <section className="section-y bg-white">
        <div className="container-x">
          <div className="max-w-2xl mx-auto text-center">
            <p className="eyebrow">What we do</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              Three practices, one team.
            </h2>
          </div>
          <div className="mt-16">
            <ServicePractices />
          </div>
        </div>
      </section>

      <EngagementProcess />

      <Testimonials />

      <section className="bg-[var(--bg-cream)]">
        <div className="container-x section-y flex flex-col md:flex-row items-start md:items-center gap-6 justify-between">
          <div>
            <h2 className="font-display font-extrabold text-3xl md:text-4xl leading-tight text-[var(--bg-dark)]">
              Interested in becoming a client?
            </h2>
            <p className="mt-3 text-[var(--muted)]">
              We onboard new engagements at the start of every UIUC semester.
            </p>
          </div>
          <Link href="/contact" className="btn btn-gold">Get in touch</Link>
        </div>
      </section>
    </>
  );
}
