import type { Metadata } from "next";
import { TimelineEvent } from "@/components/TimelineEvent";
import { FAQAccordion } from "@/components/FAQAccordion";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { PageHero } from "@/components/PageHero";
import { FALL_RECRUITMENT, FAQS, SITE } from "@/lib/content";

export const metadata: Metadata = {
  title: "Join Us",
  description: `Recruitment information and FAQs for ${FALL_RECRUITMENT.semester} CUBE Consulting hiring.`,
};

const GALLERY_IMAGES = [
  { src: "/scraped/join-us/img1.JPG", alt: "CUBE team event" },
  { src: "/scraped/join-us/img2.JPG", alt: "Consultants collaborating" },
  { src: "/scraped/join-us/img3.JPG", alt: "Members at a CUBE event" },
  { src: "/scraped/join-us/img4.JPG", alt: "Team gathering" },
  { src: "/scraped/join-us/img5.JPG", alt: "CUBE social" },
  { src: "/scraped/join-us/img6.JPG", alt: "CUBE retreat" },
  { src: "/scraped/join-us/img7.JPG", alt: "Team photo" },
  { src: "/scraped/join-us/img8.png", alt: "Team photo" },
];

export default function JoinUsPage() {
  return (
    <>
      <PageHero
        eyebrow={`${FALL_RECRUITMENT.semester} Recruitment`}
        title="Join the team."
        blurb="We hire passionate students from every major. Apply if you love solving problems, designing creative solutions, and giving back to your community."
      >
        <div className="flex flex-wrap gap-3">
          <a href={SITE.applyForm} target="_blank" rel="noreferrer noopener" className="btn btn-gold">
            Apply Now
          </a>
          <a
            href={SITE.mailingListForm}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-gold-outline"
          >
            Join the Mailing List
          </a>
        </div>
        <p className="mt-5 text-sm text-white/55">
          Applications open <span className="font-semibold text-[var(--gold)]">{FALL_RECRUITMENT.appsOpen}</span>.
        </p>
      </PageHero>

      <section className="section-y bg-white">
        <div className="container-x grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-5">
            <p className="eyebrow">Timeline</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              {FALL_RECRUITMENT.semester} dates.
            </h2>
            <p className="mt-5 text-[var(--muted)] text-[17px] leading-relaxed">
              Mark these on your calendar. All times Central; locations announced via email and Instagram.
            </p>
          </div>
          <div className="lg:col-span-7">
            <ol className="rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)]/40 p-6 md:p-8">
              {FALL_RECRUITMENT.timeline.map((t, i, arr) => (
                <TimelineEvent
                  key={t.date}
                  date={t.date}
                  event={t.event}
                  last={i === arr.length - 1}
                />
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section-y bg-[var(--bg-cream)]">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="eyebrow">Frequently asked</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              FAQs.
            </h2>
          </div>
          <div className="mt-10 max-w-3xl">
            <FAQAccordion items={FAQS} />
          </div>
        </div>
      </section>

      <section className="section-y bg-white">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="eyebrow">Life at CUBE</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              Photos from recent semesters.
            </h2>
          </div>
          <div className="mt-12">
            <PhotoCarousel images={GALLERY_IMAGES} />
          </div>
        </div>
      </section>

      <section className="bg-[var(--bg-dark)] text-white">
        <div className="container-x section-y text-center">
          <h2 className="font-display font-extrabold text-4xl md:text-5xl leading-tight">
            Ready to apply?
          </h2>
          <p className="mt-4 max-w-xl mx-auto text-white/75 text-[17px] leading-relaxed">
            The application is short and the process moves quickly. Final decisions go out on{" "}
            {FALL_RECRUITMENT.timeline.at(-1)?.date}.
          </p>
          <a
            href={SITE.applyForm}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-gold mt-9"
          >
            Apply Now
          </a>
        </div>
      </section>
    </>
  );
}
