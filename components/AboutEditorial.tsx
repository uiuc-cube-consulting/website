"use client";

import Link from "next/link";
import { ArrowRight, Calendar, MapPin, Users } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { SITE } from "@/lib/content";

/**
 * Editorial replacement for the boxy 5/7 home About section. Foregrounds a
 * tight thesis statement and pairs the supporting copy with a vertical
 * "EST. 2012" sidebar so the lower half doesn't read as an empty void.
 */
export function AboutEditorial() {
  const reduced = useReducedMotion();

  return (
    <section
      id="about"
      className="relative isolate section-y bg-white scroll-mt-24 overflow-hidden"
    >
      <BackdropCube />

      <div className="container-x relative">
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.5 }}
          className="eyebrow"
        >
          About {SITE.shortName}
        </motion.p>

        <motion.h2
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="mt-5 font-display font-extrabold text-[var(--bg-dark)] text-[2.4rem] sm:text-5xl md:text-[3.4rem] lg:text-[4rem] leading-[1.04] tracking-tight max-w-5xl"
        >
          A cross-disciplinary{" "}
          <span className="relative inline-block">
            <span className="relative z-10">team of builders</span>
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-1 md:bottom-2 h-2 md:h-3 bg-[var(--gold)]/35 -z-0"
            />
          </span>{" "}
          delivering work that actually ships.
        </motion.h2>

        <motion.ul
          initial={reduced ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: 0.18 }}
          className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-semibold tracking-[0.2em] uppercase text-[var(--muted)]"
        >
          <li className="inline-flex items-center gap-2">
            <Calendar size={14} className="text-[var(--gold-deep)]" />
            Founded 2012
          </li>
          <span aria-hidden className="h-3 w-px bg-[var(--border)]" />
          <li className="inline-flex items-center gap-2">
            <MapPin size={14} className="text-[var(--gold-deep)]" />
            UIUC
          </li>
          <span aria-hidden className="h-3 w-px bg-[var(--border)]" />
          <li className="inline-flex items-center gap-2">
            <Users size={14} className="text-[var(--gold-deep)]" />
            50+ Consultants
          </li>
        </motion.ul>

        <div className="mt-14 grid lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Vertical sidebar: anchors the lower half so it doesn't sit empty */}
          <motion.aside
            initial={reduced ? false : { opacity: 0, x: -16 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.55, delay: 0.05 }}
            className="lg:col-span-4 relative"
          >
            <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)]/55 p-6 md:p-7">
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-[var(--gold)]"
              />
              <p className="text-[10.5px] tracking-[0.28em] uppercase font-bold text-[var(--gold-deep)]">
                Est. 2012
              </p>
              <p className="mt-3 font-display font-extrabold text-[var(--bg-dark)] text-[1.6rem] leading-[1.1]">
                Over a decade of student-run consulting at UIUC.
              </p>

              <ul className="mt-6 space-y-3 text-[13px] text-[var(--muted)] leading-relaxed">
                <li className="flex items-baseline gap-3">
                  <span className="font-display font-extrabold text-[var(--gold-deep)] text-base tabular-nums">
                    180+
                  </span>
                  <span>Client engagements delivered</span>
                </li>
                <li className="flex items-baseline gap-3">
                  <span className="font-display font-extrabold text-[var(--gold-deep)] text-base tabular-nums">
                    50+
                  </span>
                  <span>Active consultants every semester</span>
                </li>
                <li className="flex items-baseline gap-3">
                  <span className="font-display font-extrabold text-[var(--gold-deep)] text-base tabular-nums">
                    3
                  </span>
                  <span>Practices: business, engineering, design</span>
                </li>
              </ul>
            </div>
          </motion.aside>

          {/* Supporting copy */}
          <div className="lg:col-span-8 space-y-5 text-[var(--muted)] text-[17px] leading-[1.75]">
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, delay: 0.1 }}
            >
              For over a decade, our consultants have built business and engineering solutions
              for clients across Champaign-Urbana, Chicagoland, and beyond. We&apos;re an
              interdisciplinary team of UIUC undergraduates who care about the craft of consulting
              and the people we work alongside.
            </motion.p>
            <motion.p
              initial={reduced ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, delay: 0.18 }}
            >
              Every semester we ship deliverables that real clients put in front of customers,
              investors, and engineering teams, and every semester we recruit the next cohort
              who&apos;ll do the same.
            </motion.p>

            <motion.div
              initial={reduced ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: 0.26 }}
              className="pt-3"
            >
              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-[13px] tracking-[0.18em] uppercase font-bold text-[var(--bg-dark)] hover:text-[var(--gold-deep)] transition-colors"
              >
                More about us
                <ArrowRight size={16} />
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BackdropCube() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-12 right-2 md:right-8 lg:right-12 w-[220px] md:w-[300px] lg:w-[360px] aspect-square opacity-[0.05]"
    >
      <svg viewBox="0 0 200 200" fill="none" className="w-full h-full text-[var(--bg-dark)]">
        <path
          d="M100 18 L180 60 L180 140 L100 182 L20 140 L20 60 Z"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M100 18 L100 100" stroke="currentColor" strokeWidth="1.4" />
        <path d="M20 60 L100 100" stroke="currentColor" strokeWidth="1.4" />
        <path d="M180 60 L100 100" stroke="currentColor" strokeWidth="1.4" />
        <path d="M100 100 L100 182" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>
  );
}
