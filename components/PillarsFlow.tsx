"use client";

import { Sprout, Target, Compass, Users } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { PILLARS } from "@/lib/content";

const ICONS = {
  growth: Sprout,
  impact: Target,
  leadership: Compass,
  diversity: Users,
} as const;

/**
 * Editorial, numbered storytelling flow for the four pillars. Replaces the
 * uniform 4-column card grid with a vertical, alternating-side layout tied
 * together by a thin gold hairline.
 */
export function PillarsFlow() {
  const reduced = useReducedMotion();

  const item: Variants = {
    hidden: reduced ? { opacity: 1 } : { opacity: 0, y: 28 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <ol className="relative mt-14 space-y-14 md:space-y-20">
      <span
        aria-hidden
        className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[var(--gold)]/35 to-transparent"
      />

      {PILLARS.map((p, i) => {
        const Icon = ICONS[p.key as keyof typeof ICONS] ?? Sprout;
        const flipped = i % 2 === 1;

        return (
          <motion.li
            key={p.key}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
            variants={item}
            className="relative grid md:grid-cols-2 gap-6 md:gap-12 items-center"
          >
            <span
              aria-hidden
              className="hidden md:grid absolute left-1/2 -translate-x-1/2 place-items-center w-10 h-10 rounded-full bg-[var(--bg)] border border-[var(--gold)]/40 text-[var(--gold-deep)] text-[11px] font-bold tracking-wider"
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            {/* Numeral side */}
            <div
              className={
                flipped
                  ? "md:order-2 md:pl-16 lg:pl-24"
                  : "md:pr-16 lg:pr-24 md:text-right"
              }
            >
              <div
                className={
                  "flex items-end gap-4 md:gap-5 " +
                  (flipped ? "md:justify-start" : "md:justify-end")
                }
              >
                <span className="font-display font-black text-[6.5rem] md:text-[8rem] leading-[0.85] text-[var(--gold)]/15 tracking-tight select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="grid place-items-center w-14 h-14 rounded-2xl bg-[var(--bg-cream)] text-[var(--bg-dark)] mb-2 shrink-0">
                  <Icon size={26} strokeWidth={1.75} />
                </span>
              </div>
            </div>

            {/* Copy side */}
            <div
              className={
                flipped
                  ? "md:order-1 md:pr-16 lg:pr-24 md:text-right"
                  : "md:pl-16 lg:pl-24"
              }
            >
              <p className="eyebrow">Pillar {String(i + 1).padStart(2, "0")}</p>
              <h3 className="mt-3 font-display font-extrabold text-3xl md:text-4xl text-[var(--bg-dark)] leading-[1.05]">
                {p.title}.
              </h3>
              <p className="mt-4 text-[var(--muted)] text-[16px] md:text-[17px] leading-relaxed max-w-md md:ml-auto md:mr-0">
                {p.blurb}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
