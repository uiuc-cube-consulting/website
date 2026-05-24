"use client";

import { Compass, Layers, GitBranch, Send, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

type Phase = {
  num: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
};

const PHASES: Phase[] = [
  {
    num: "01",
    title: "Scope",
    blurb:
      "We kick off with the client team, define the problem, lock the deliverable, and put a workplan in writing.",
    icon: Compass,
  },
  {
    num: "02",
    title: "Build",
    blurb:
      "Consultants split into workstreams. Research, modeling, and engineering run in parallel with weekly client syncs.",
    icon: Layers,
  },
  {
    num: "03",
    title: "Review",
    blurb:
      "Midpoint check-in with the client. Executive partners pressure-test the work and we adjust the back half.",
    icon: GitBranch,
  },
  {
    num: "04",
    title: "Ship",
    blurb:
      "Final presentation, written recommendations, and any code or assets handed off so the client can take it from here.",
    icon: Send,
  },
];

const ITEM: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

/**
 * Horizontal four-phase engagement timeline. Distinct from the practices
 * section: this answers "how does a CUBE project actually unfold?" rather
 * than restating "business, engineering, design."
 */
export function EngagementProcess() {
  const reduced = useReducedMotion();

  return (
    <section className="relative isolate bg-[var(--bg-dark)] text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-55"
        style={{
          background:
            "radial-gradient(700px 360px at 80% 0%, rgba(212,166,87,0.16), transparent 65%), radial-gradient(700px 360px at 20% 100%, rgba(212,166,87,0.10), transparent 70%)",
        }}
      />

      <div className="container-x section-y">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.45 }}
          transition={{ duration: 0.55 }}
          className="max-w-2xl"
        >
          <p className="eyebrow">How we work</p>
          <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.05]">
            Inside a CUBE engagement.
          </h2>
          <p className="mt-5 text-white/70 leading-relaxed max-w-md">
            Every project runs the same four-phase loop, scaled to the scope. Here&apos;s what
            the semester looks like for a client team.
          </p>
        </motion.div>

        <motion.ol
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.15 }}
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: reduced ? 0 : 0.1, delayChildren: 0.1 },
            },
          }}
          className="relative mt-14 grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-0"
        >
          <span
            aria-hidden
            className="hidden md:block absolute left-[7%] right-[7%] top-[58px] h-px bg-gradient-to-r from-transparent via-[var(--gold)]/45 to-transparent"
          />

          {PHASES.map((p, i) => {
            const Icon = p.icon;
            const isLast = i === PHASES.length - 1;
            return (
              <motion.li
                key={p.num}
                variants={ITEM}
                className={
                  "relative px-2 md:px-5 lg:px-6 " +
                  (!isLast ? "md:border-r md:border-white/[0.08]" : "")
                }
              >
                <div className="flex items-center gap-3">
                  <span className="relative z-10 grid place-items-center w-14 h-14 rounded-full bg-[var(--bg-dark-2)] border border-[var(--gold)]/40 text-[var(--gold)] shadow-[0_0_0_4px_var(--bg-dark)]">
                    <Icon size={22} strokeWidth={1.6} />
                  </span>
                  <span className="font-display font-black text-[2.4rem] leading-none text-[var(--gold)]/30 tracking-tight">
                    {p.num}
                  </span>
                </div>
                <h3 className="mt-5 font-display font-extrabold text-xl text-white">
                  {p.title}.
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/75">
                  {p.blurb}
                </p>
              </motion.li>
            );
          })}
        </motion.ol>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] tracking-[0.22em] uppercase font-bold text-white/55"
        >
          <span className="text-[var(--gold)]">Semester rhythm</span>
          <span aria-hidden className="h-3 w-px bg-white/15" />
          <span>12 to 14 weeks</span>
          <span aria-hidden className="h-3 w-px bg-white/15" />
          <span>Weekly client syncs</span>
          <span aria-hidden className="h-3 w-px bg-white/15" />
          <span>Executive partner review</span>
        </motion.div>
      </div>
    </section>
  );
}
