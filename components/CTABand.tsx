"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function CTABand({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: ReactNode;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <section className="relative isolate bg-[var(--bg-dark)] text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-80"
        style={{
          background:
            "radial-gradient(700px 360px at 50% 0%, rgba(212,166,87,0.22), transparent 65%), radial-gradient(500px 280px at 50% 100%, rgba(212,166,87,0.10), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)]/60 to-transparent"
      />

      <motion.div
        initial={reduced ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="container-x section-y text-center"
      >
        <h2 className="font-display font-extrabold text-4xl md:text-5xl leading-tight">
          {title}
        </h2>
        {blurb && (
          <p className="mt-5 max-w-xl mx-auto text-[var(--fg-on-dark)]/75 text-[17px] leading-relaxed">
            {blurb}
          </p>
        )}
        {children && (
          <div className="mt-9 flex flex-wrap gap-3 justify-center">{children}</div>
        )}
      </motion.div>
    </section>
  );
}
