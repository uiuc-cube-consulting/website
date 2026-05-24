import type { Metadata } from "next";
import { PillarsFlow } from "@/components/PillarsFlow";
import { ExecCard } from "@/components/ExecCard";
import { LogoStrip } from "@/components/LogoStrip";
import { PageHero } from "@/components/PageHero";
import { AlumniGrid } from "@/components/AlumniGrid";
import { PARTNER_LOGOS } from "@/lib/content";
import { EXEC_BOARD } from "@/lib/team";

export const metadata: Metadata = {
  title: "About",
  description:
    "Who is CUBE Consulting? A student-run nonprofit founded in 2012 at the University of Illinois at Urbana-Champaign.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Get to know us"
        title="Who is CUBE?"
        blurb="CUBE Consulting is a student-run nonprofit founded in 2012. We&rsquo;re a cross-disciplinary team of UIUC undergraduates pursuing careers in management consulting, banking, product, healthtech, private equity, marketing, and research."
      />

      <section className="section-y bg-white">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="eyebrow">Core values</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              What we stand for.
            </h2>
          </div>
          <PillarsFlow />
        </div>
      </section>

      <section className="section-y bg-[var(--bg-cream)]">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="eyebrow">Leadership</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              Executive Board.
            </h2>
            <p className="mt-5 text-[var(--muted)] text-[17px] leading-relaxed">
              The people who keep CUBE running, semester after semester.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {EXEC_BOARD.map((m) => <ExecCard key={m.name} member={m} />)}
          </div>
        </div>
      </section>

      <AlumniGrid />

      <LogoStrip title="Affiliations" items={PARTNER_LOGOS} />
    </>
  );
}
