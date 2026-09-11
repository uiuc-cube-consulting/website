import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Answers the single most common question a prospective applicant has --
 * "am I even eligible?" -- at the point in the page where they start
 * wondering, and doubles as the break between what CUBE is and what CUBE
 * ships.
 *
 * Deliberately NOT a scrolling band of viewport-scale type: static, left
 * aligned, moderate type scale, and carrying three supporting facts rather
 * than one repeated phrase. The claim earns the space because it is backed up
 * underneath it, not because it is large.
 *
 * Every supporting line is drawn from the eligibility copy already on
 * /join-us, so the two pages cannot drift apart.
 */
const CRITERIA = [
  {
    term: "Any major",
    detail: "Business, engineering, CS, design, the arts, the sciences.",
  },
  {
    term: "Any year",
    detail: "Freshmen through seniors. Some alumni joined their last semester.",
  },
  {
    term: "No experience",
    detail: "We run a case workshop during recruitment. You will be ready.",
  },
];

export function HiringStatement() {
  return (
    <section className="bg-[var(--bg-dark)] text-white">
      <div className="container-x section-y">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="eyebrow eyebrow-on-dark">Who we hire</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.04]">
              Every major.
              <br />
              Every year.
            </h2>
            <p className="mt-5 text-white/70 leading-relaxed max-w-md">
              We hire for curiosity and ownership, not a resume line. Half the
              team had never seen a case before they applied.
            </p>
            <Link
              href="/join-us"
              className="mt-7 inline-flex items-center gap-2 text-[var(--gold)] hover:gap-3 transition-all text-sm font-semibold uppercase tracking-[0.18em]"
            >
              How recruitment works
              <ArrowRight size={16} />
            </Link>
          </div>

          <dl className="lg:col-span-7 grid sm:grid-cols-3 gap-x-8 gap-y-8 lg:pt-2">
            {CRITERIA.map((c) => (
              <div key={c.term} className="group">
                <span
                  aria-hidden
                  className="block h-0.5 w-10 bg-[var(--gold)] transition-all duration-300 group-hover:w-full"
                />
                <dt className="mt-5 font-display font-extrabold text-xl md:text-2xl leading-tight">
                  {c.term}
                </dt>
                <dd className="mt-2.5 text-[14.5px] leading-relaxed text-white/60">
                  {c.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
