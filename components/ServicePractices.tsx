"use client";

import { Briefcase, Code2, PenTool, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { SERVICE_CATEGORIES } from "@/lib/content";

const ICONS: LucideIcon[] = [Briefcase, Code2, PenTool];

/**
 * Editorial replacement for the 3-card cream grid on the Services page.
 * Each practice gets its own alternating-side row with an oversized numeral,
 * an icon medallion, and a two-column scope grid instead of a bulleted list.
 */
export function ServicePractices() {
  const reduced = useReducedMotion();

  return (
    <ol className="relative space-y-20 md:space-y-28">
      <span
        aria-hidden
        className="hidden md:block absolute left-1/2 top-6 bottom-6 w-px bg-gradient-to-b from-transparent via-[var(--border)] to-transparent"
      />

      {SERVICE_CATEGORIES.map((cat, i) => {
        const Icon = ICONS[i] ?? Briefcase;
        const flipped = i % 2 === 1;

        return (
          <motion.li
            key={cat.title}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative grid lg:grid-cols-12 gap-8 lg:gap-12 items-center"
          >
            <span
              aria-hidden
              className="hidden md:grid absolute left-1/2 -translate-x-1/2 -top-2 place-items-center w-12 h-12 rounded-full bg-white border border-[var(--gold)]/35 text-[var(--gold-deep)] font-display font-extrabold text-sm"
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            {/* Headline side */}
            <div
              className={
                "lg:col-span-5 " +
                (flipped ? "lg:order-2 lg:pl-10" : "lg:pr-10 lg:text-right")
              }
            >
              <div
                className={
                  "inline-flex items-center gap-3 " +
                  (flipped ? "" : "lg:flex-row-reverse")
                }
              >
                <span className="grid place-items-center w-14 h-14 rounded-2xl bg-[var(--bg-dark)] text-[var(--gold)]">
                  <Icon size={26} strokeWidth={1.5} />
                </span>
                <span className="font-display font-black text-[3.2rem] md:text-[4rem] leading-none text-[var(--gold)]/25 tracking-tight select-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>

              <h3 className="mt-5 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.02]">
                {cat.title}.
              </h3>
              <p
                className={
                  "mt-4 text-[16.5px] leading-relaxed text-[var(--muted)] max-w-md " +
                  (flipped ? "" : "lg:ml-auto")
                }
              >
                {cat.blurb}
              </p>
            </div>

            {/* Scope side */}
            <div
              className={
                "lg:col-span-7 " +
                (flipped ? "lg:order-1 lg:pr-10" : "lg:pl-10")
              }
            >
              <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                {cat.points.map((point, idx) => (
                  <li
                    key={point}
                    className="group relative pl-10 py-3 border-b border-[var(--border)] last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
                  >
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 -translate-y-1/2 grid place-items-center w-7 h-7 rounded-full border border-[var(--gold)]/40 text-[var(--gold-deep)] text-[11px] font-bold tabular-nums tracking-wide group-hover:bg-[var(--gold)] group-hover:text-[var(--bg-dark)] transition-colors"
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[15px] text-[var(--bg-dark)] font-medium">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}
