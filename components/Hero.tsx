"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { SITE } from "@/lib/content";

export function Hero() {
  const reduced = useReducedMotion();

  return (
    <section className="relative isolate w-full overflow-hidden bg-[var(--bg-dark)] text-white">
      <Image
        src="/hero.JPG"
        alt="CUBE Consulting team"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center -z-10"
      />

      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-[rgba(21,17,11,0.62)] via-[rgba(21,17,11,0.42)] to-[rgba(21,17,11,0.92)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-50"
        style={{
          background:
            "radial-gradient(900px 480px at 78% 18%, rgba(212,166,87,0.22), transparent 60%), radial-gradient(700px 400px at 12% 88%, rgba(212,166,87,0.14), transparent 65%)",
        }}
      />

      <FloatingAccents />

      <div className="container-x relative flex flex-col items-center justify-center text-center min-h-[78vh] md:min-h-[88vh] py-24 md:py-32">
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="eyebrow text-[var(--gold)]/90"
        >
          Student-run · Founded 2012
        </motion.p>

        <motion.h1
          initial={reduced ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          className="mt-5 font-display font-extrabold text-white leading-[1.02] text-5xl sm:text-6xl md:text-7xl lg:text-[88px] tracking-tight max-w-5xl drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
        >
          {SITE.tagline}
        </motion.h1>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-3 md:gap-4"
        >
          <Link href="/join-us" className="btn btn-gold">
            Recruitment Timeline
          </Link>
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
        </motion.div>

        <motion.a
          href="#about"
          aria-label="Scroll to learn more"
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="hidden md:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center gap-2 text-white/55 hover:text-[var(--gold)] transition-colors"
        >
          <span className="text-[10px] tracking-[0.32em] uppercase font-semibold">
            Scroll
          </span>
          <motion.span
            animate={reduced ? undefined : { y: [0, 6, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="grid place-items-center w-8 h-8 rounded-full border border-white/25"
          >
            <ArrowDown size={14} />
          </motion.span>
        </motion.a>
      </div>
    </section>
  );
}

function FloatingAccents() {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <div aria-hidden className="absolute inset-0 -z-10 pointer-events-none">
      <motion.span
        className="absolute top-[18%] left-[8%] w-3 h-3 rounded-sm bg-[var(--gold)]/40"
        animate={{ y: [0, -14, 0], rotate: [0, 12, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.span
        className="absolute top-[60%] left-[14%] w-2 h-2 rounded-full bg-[var(--gold)]/55"
        animate={{ y: [0, 10, 0], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      />
      <motion.span
        className="absolute top-[26%] right-[10%] w-4 h-4 rounded-sm border border-[var(--gold)]/35 rotate-12"
        animate={{ rotate: [12, 24, 12], y: [0, -10, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
      <motion.span
        className="absolute bottom-[22%] right-[18%] w-2.5 h-2.5 rounded-full bg-[var(--gold)]/45"
        animate={{ y: [0, 12, 0], opacity: [0.35, 0.7, 0.35] }}
        transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1.2 }}
      />
    </div>
  );
}
