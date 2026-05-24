"use client";

import { motion, useReducedMotion } from "framer-motion";
import { TESTIMONIALS } from "@/lib/content";

export function Testimonials() {
  const reduced = useReducedMotion();

  return (
    <section className="relative isolate bg-[var(--bg-dark)] text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(700px 360px at 50% 0%, rgba(212,166,87,0.16), transparent 70%), radial-gradient(500px 280px at 50% 100%, rgba(212,166,87,0.08), transparent 70%)",
        }}
      />

      <div className="container-x section-y">
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-2xl mx-auto text-center"
        >
          <p className="eyebrow">In their words</p>
          <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.05]">
            What clients say.
          </h2>
        </motion.div>

        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: reduced ? 0 : 0.12, delayChildren: 0.05 } },
          }}
          className="mt-14 grid md:grid-cols-3 gap-8 md:gap-10"
        >
          {TESTIMONIALS.map((t, i) => (
            <motion.blockquote
              key={i}
              variants={{
                hidden: { opacity: 0, y: 24 },
                visible: {
                  opacity: 1,
                  y: 0,
                  transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                },
              }}
              className="relative text-center px-5 md:px-6 py-7 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-[var(--gold)]/40 hover:bg-white/[0.05] transition-colors"
            >
              <span
                aria-hidden
                className="block font-display font-black text-[var(--gold)] text-7xl leading-none mb-2 drop-shadow-[0_4px_18px_rgba(212,166,87,0.35)]"
              >
                &ldquo;
              </span>
              <p className="text-white/85 text-[14.5px] leading-relaxed">{t.quote}</p>
              <footer className="mt-5 pt-5 border-t border-white/10">
                <div className="font-display font-bold text-white text-[15px]">
                  {t.author}
                  {t.title && `, ${t.title}`}
                </div>
                <div className="text-[11px] tracking-[0.22em] uppercase text-[var(--gold)] mt-1">
                  {t.company}
                </div>
              </footer>
            </motion.blockquote>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
