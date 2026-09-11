"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { SITE } from "@/lib/content";

export function Hero() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  /**
   * Pointer-tracked gold spotlight.
   *
   * Replaces the four floating squares that used to drift here on infinite
   * loops -- ambient motion that carried no information and read as template.
   * This responds to the visitor instead: the light follows the cursor, so the
   * hero feels alive only while someone is actually there.
   *
   * Written straight to CSS custom properties through a ref so moving the mouse
   * never triggers a React render, and skipped entirely for reduced-motion or
   * coarse pointers (no cursor to track on a phone).
   */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (reduced) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
        el.style.setProperty("--glow", "1");
      });
    };
    const onLeave = () => el.style.setProperty("--glow", "0");

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  return (
    <section
      ref={sectionRef}
      className="hero-spotlight relative isolate w-full overflow-hidden bg-[var(--bg-dark)] text-white"
    >
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
            "radial-gradient(900px 480px at 78% 18%, rgba(223,174,62,0.22), transparent 60%), radial-gradient(700px 400px at 12% 88%, rgba(223,174,62,0.14), transparent 65%)",
        }}
      />

      {/* The tracked light itself. Sits above the photo, under the copy. */}
      <div aria-hidden className="hero-spotlight__glow" />

      <div className="container-x relative flex flex-col items-center justify-center text-center min-h-[78vh] md:min-h-[88vh] py-24 md:py-32">
        <motion.p
          initial={reduced ? false : { opacity: 0.35, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="eyebrow eyebrow-on-dark"
        >
          {SITE.tagline} · Student-run since 2012
        </motion.p>

        <motion.h1
          initial={reduced ? false : { opacity: 0.35, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.12 }}
          className="mt-5 font-display font-extrabold text-white leading-[1.02] text-4xl sm:text-5xl md:text-6xl lg:text-[76px] max-w-5xl drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
        >
          Business and engineering consulting at UIUC.
        </motion.h1>

        <motion.p
          initial={reduced ? false : { opacity: 0.35, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.22 }}
          className="mt-6 max-w-2xl text-[17px] md:text-lg leading-relaxed text-white/75"
        >
          180+ engagements since 2012 for founders, operators, and Fortune 500
          teams.
        </motion.p>

        <motion.div
          initial={reduced ? false : { opacity: 0.35, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
          className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-3 md:gap-4"
        >
          <Link href="/contact" className="btn btn-gold btn-sweep">
            Work with us
          </Link>
          <Link href="/join-us" className="btn btn-light-outline btn-sweep">
            Join the team
          </Link>
        </motion.div>

        <motion.a
          href="#what-we-do"
          aria-label="Scroll to learn more"
          initial={reduced ? false : { opacity: 0.35 }}
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
