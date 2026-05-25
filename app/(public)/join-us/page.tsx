import type { Metadata } from "next";
import { FileText, Coffee, MessageSquareText, CheckCircle2, Sparkles, BookOpen, Users } from "lucide-react";
import { TimelineEvent } from "@/components/TimelineEvent";
import { FAQAccordion } from "@/components/FAQAccordion";
import { PhotoCarousel } from "@/components/PhotoCarousel";
import { PageHero } from "@/components/PageHero";
import { CTABand } from "@/components/CTABand";
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
  { src: "/scraped/join-us/img8.jpg", alt: "Team photo" },
];

const PROCESS_STEPS = [
  {
    icon: FileText,
    label: "Step 01",
    title: "Apply",
    blurb: "Submit a short application — name, year, resume, and a few prompts. Takes about 15 minutes.",
  },
  {
    icon: Coffee,
    label: "Step 02",
    title: "Connect",
    blurb: "Come to our networking and info nights. Open to everyone who applied — meet the team and ask anything.",
  },
  {
    icon: MessageSquareText,
    label: "Step 03",
    title: "Interview",
    blurb: "Invite-only behavioral and case rounds. We'll run a workshop beforehand so you know exactly what to expect.",
  },
  {
    icon: CheckCircle2,
    label: "Step 04",
    title: "Decide",
    blurb: "Final decisions go out the same week. Onboarding for the new cohort starts the following Monday.",
  },
];

const PREP_ITEMS = [
  "Read one of Case in Point or Case Interview Secrets — front to back.",
  "Practice 3–4 cases out loud with a partner. Speak through your structure.",
  "Have a clean one-page resume. Be ready to walk through it in 60 seconds.",
  "Attend the interview workshop — we'll cover the rubric and run live examples.",
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
        <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/8 border border-white/12 px-4 py-1.5 text-[12px] tracking-[0.18em] uppercase font-semibold text-[var(--gold)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--gold)] animate-pulse" aria-hidden />
          Applications open {FALL_RECRUITMENT.appsOpen}
        </p>
      </PageHero>

      <section className="section-y bg-white">
        <div className="container-x">
          <div className="max-w-2xl">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.05]">
              Four steps, two weeks.
            </h2>
            <p className="mt-5 text-[var(--muted)] text-[17px] leading-relaxed">
              A clear path from application to offer. Everyone who applies is welcome at the networking nights.
            </p>
          </div>

          <ol className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PROCESS_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="group relative rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)]/30 p-6 hover:border-[var(--gold)] hover:bg-white hover:shadow-md transition-all"
                >
                  <div className="grid place-items-center w-11 h-11 rounded-xl bg-white border border-[var(--border)] text-[var(--gold-deep)] group-hover:bg-[var(--gold)] group-hover:text-[var(--bg-dark)] group-hover:border-[var(--gold)] transition-colors">
                    <Icon size={20} />
                  </div>
                  <p className="mt-5 text-[10.5px] tracking-[0.28em] uppercase font-bold text-[var(--gold-deep)]">
                    {step.label}
                  </p>
                  <h3 className="mt-2 font-display font-extrabold text-[var(--bg-dark)] text-xl">
                    {step.title}
                  </h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-[var(--muted)]">
                    {step.blurb}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="section-y bg-[var(--bg-cream)]/40">
        <div className="container-x grid lg:grid-cols-2 gap-8 lg:gap-10">
          <div className="rounded-2xl border border-[var(--border)] bg-white p-7 md:p-9">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-cream)] px-3 py-1 text-[10.5px] tracking-[0.24em] uppercase font-bold text-[var(--gold-deep)]">
              <Users size={13} />
              Who we look for
            </div>
            <h3 className="mt-5 font-display font-extrabold text-[var(--bg-dark)] text-2xl md:text-3xl leading-[1.1]">
              Open to every major, every year.
            </h3>
            <p className="mt-4 text-[var(--muted)] text-[15.5px] leading-relaxed">
              We hire for curiosity, ownership, and the willingness to figure things out alongside teammates. No prior consulting experience required.
            </p>
            <ul className="mt-6 space-y-3 text-[14.5px] text-[var(--bg-dark)]">
              <li className="flex items-start gap-3">
                <Sparkles size={16} className="mt-1 text-[var(--gold-deep)] shrink-0" />
                <span>
                  <span className="font-semibold">Any major.</span>{" "}
                  <span className="text-[var(--muted)]">Business, engineering, CS, design, the arts, the sciences — all welcome.</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Sparkles size={16} className="mt-1 text-[var(--gold-deep)] shrink-0" />
                <span>
                  <span className="font-semibold">Any year.</span>{" "}
                  <span className="text-[var(--muted)]">Freshmen through seniors. We have alumni who joined in their last semester.</span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Sparkles size={16} className="mt-1 text-[var(--gold-deep)] shrink-0" />
                <span>
                  <span className="font-semibold">Cares about the craft.</span>{" "}
                  <span className="text-[var(--muted)]">You want to ship work that real people see, not just resume bullets.</span>
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-white p-7 md:p-9">
            <div className="inline-flex items-center gap-2 rounded-full bg-[var(--bg-cream)] px-3 py-1 text-[10.5px] tracking-[0.24em] uppercase font-bold text-[var(--gold-deep)]">
              <BookOpen size={13} />
              How to prepare
            </div>
            <h3 className="mt-5 font-display font-extrabold text-[var(--bg-dark)] text-2xl md:text-3xl leading-[1.1]">
              You don&rsquo;t need to be polished. You need to be prepared.
            </h3>
            <p className="mt-4 text-[var(--muted)] text-[15.5px] leading-relaxed">
              A short checklist that puts you in good shape before the interview round.
            </p>
            <ul className="mt-6 space-y-3 text-[14.5px] text-[var(--bg-dark)]">
              {PREP_ITEMS.map((item, i) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 grid place-items-center w-6 h-6 rounded-full bg-[var(--bg-cream)] text-[var(--gold-deep)] text-[11px] font-bold tabular-nums shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-[var(--muted)]">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

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

      <CTABand
        title="Ready to apply?"
        blurb={
          <>
            The application is short and the process moves quickly. Final decisions go out on{" "}
            {FALL_RECRUITMENT.timeline.at(-1)?.date}.
          </>
        }
      >
        <a
          href={SITE.applyForm}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-gold"
        >
          Apply Now
        </a>
        <a
          href={SITE.mailingListForm}
          target="_blank"
          rel="noreferrer noopener"
          className="btn btn-gold-outline"
        >
          Mailing List
        </a>
      </CTABand>
    </>
  );
}
