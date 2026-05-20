import type { Metadata } from "next";
import Link from "next/link";
import { Check, Briefcase, Code2, PenTool } from "lucide-react";
import { SERVICE_CATEGORIES, CLIENT_LOGOS } from "@/lib/content";
import { ClientCarousel } from "@/components/ClientCarousel";
import { MultidisciplinarySolutions } from "@/components/MultidisciplinarySolutions";
import { Testimonials } from "@/components/Testimonials";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Business, engineering, and design services delivered by CUBE Consulting at UIUC.",
};

const ICONS = [Briefcase, Code2, PenTool];

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
            <ClientCarousel items={CLIENT_LOGOS.map((n) => ({ name: n }))} />
          </div>
        </div>
      </section>

      <MultidisciplinarySolutions />

      <section className="section-y bg-white">
        <div className="container-x">
          <div className="max-w-2xl mx-auto text-center">
            <p className="eyebrow">How we deliver</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              Service breakdown.
            </h2>
          </div>
          <div className="mt-14 grid md:grid-cols-3 gap-6">
            {SERVICE_CATEGORIES.map((cat, i) => {
              const Icon = ICONS[i] ?? Briefcase;
              return (
                <article
                  key={cat.title}
                  className="rounded-2xl bg-[var(--bg-cream)] border border-[var(--border)] p-7 md:p-8 hover:shadow-xl hover:border-[var(--gold)] transition-all"
                >
                  <div className="grid place-items-center w-12 h-12 rounded-xl bg-white text-[var(--bg-dark)]">
                    <Icon size={22} />
                  </div>
                  <h2 className="mt-5 font-display font-extrabold text-2xl md:text-3xl text-[var(--bg-dark)]">
                    {cat.title}
                  </h2>
                  <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed">{cat.blurb}</p>
                  <ul className="mt-5 space-y-2 text-sm">
                    {cat.points.map((point) => (
                      <li key={point} className="flex items-start gap-2 text-[var(--bg-dark)]">
                        <Check size={16} className="mt-0.5 text-[var(--gold-deep)] shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      </section>

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
