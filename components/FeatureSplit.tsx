"use client";

import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { HOME_FEATURE_CARDS } from "@/lib/content";

type SplitSpec = {
  href: string;
  title: string;
  blurb: string;
  number: string;
  image: { src: string; alt: string };
  imageSide: "left" | "right";
  surface: "dark" | "cream";
};

const SPLITS: SplitSpec[] = [
  {
    href: HOME_FEATURE_CARDS[0]?.href ?? "/services",
    title: HOME_FEATURE_CARDS[0]?.title ?? "Services",
    blurb: HOME_FEATURE_CARDS[0]?.blurb ?? "",
    number: "01",
    image: {
      src: "/scraped/join-us/img2.JPG",
      alt: "Consultants collaborating on a client project",
    },
    imageSide: "left",
    surface: "cream",
  },
  {
    href: HOME_FEATURE_CARDS[1]?.href ?? "/join-us",
    title: HOME_FEATURE_CARDS[1]?.title ?? "Our Talent",
    blurb: HOME_FEATURE_CARDS[1]?.blurb ?? "",
    number: "02",
    image: {
      src: "/scraped/join-us/img4.JPG",
      alt: "CUBE team at a campus event",
    },
    imageSide: "right",
    surface: "dark",
  },
];

/**
 * Edge-to-edge two-row magazine spread for Services + Our Talent. Each row is
 * a full-bleed 5/7 split: photo on one half, headline + supporting copy on the
 * other. Fixed row heights guarantee the photo fills its half with no
 * "floating" gutters and no empty surface below.
 */
export function FeatureSplit() {
  return (
    <section className="w-full">
      {SPLITS.map((s) => (
        <SplitRow key={s.title} spec={s} />
      ))}
    </section>
  );
}

function SplitRow({ spec }: { spec: SplitSpec }) {
  const reduced = useReducedMotion();
  const isDark = spec.surface === "dark";
  const isImageLeft = spec.imageSide === "left";

  return (
    <div
      className={
        "relative w-full overflow-hidden " +
        (isDark ? "bg-[var(--bg-dark)] text-white" : "bg-[var(--bg-cream)] text-[var(--bg-dark)]")
      }
    >
      <div
        aria-hidden
        className={
          "absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent " +
          (isDark ? "via-[var(--gold)]/40" : "via-[var(--border)]")
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-12 items-stretch min-h-[460px] md:h-[540px] lg:h-[580px]">
        {/* Image side */}
        <motion.div
          initial={reduced ? false : { opacity: 0, scale: 1.04 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className={
            "relative h-72 sm:h-96 md:h-full md:col-span-7 " +
            (isImageLeft ? "md:order-1" : "md:order-2")
          }
        >
          <Image
            src={spec.image.src}
            alt={spec.image.alt}
            fill
            priority={spec.number === "01"}
            sizes="(min-width:768px) 58vw, 100vw"
            className="object-cover"
          />
          <div
            aria-hidden
            className={
              "absolute inset-0 " +
              (isDark
                ? isImageLeft
                  ? "bg-gradient-to-r from-[rgba(21,17,11,0.55)] via-transparent to-[rgba(21,17,11,0.85)]"
                  : "bg-gradient-to-l from-[rgba(21,17,11,0.55)] via-transparent to-[rgba(21,17,11,0.85)]"
                : isImageLeft
                ? "bg-gradient-to-r from-[rgba(246,239,222,0.25)] via-transparent to-[rgba(246,239,222,0.6)]"
                : "bg-gradient-to-l from-[rgba(246,239,222,0.25)] via-transparent to-[rgba(246,239,222,0.6)]")
            }
          />
          <span
            aria-hidden
            className={
              "absolute font-display font-black text-[9rem] md:text-[13rem] leading-none select-none tracking-tighter " +
              (isImageLeft ? "right-6 bottom-2" : "left-6 bottom-2") +
              " " +
              (isDark ? "text-white/[0.08]" : "text-[var(--bg-dark)]/[0.10]")
            }
          >
            {spec.number}
          </span>
        </motion.div>

        {/* Copy side */}
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          className={
            "md:col-span-5 flex flex-col justify-center px-6 sm:px-10 md:px-12 lg:px-16 py-14 md:py-12 " +
            (isImageLeft ? "md:order-2" : "md:order-1")
          }
        >
          <p
            className={
              "eyebrow " +
              (isDark ? "text-[var(--gold)]" : "text-[var(--gold-deep)]")
            }
          >
            {spec.number} · Spotlight
          </p>
          <h3
            className={
              "mt-4 font-display font-extrabold text-4xl md:text-5xl lg:text-[3.4rem] leading-[1.02] tracking-tight " +
              (isDark ? "text-white" : "text-[var(--bg-dark)]")
            }
          >
            {spec.title}.
          </h3>
          <p
            className={
              "mt-5 text-[16.5px] leading-relaxed max-w-md " +
              (isDark ? "text-white/75" : "text-[var(--muted)]")
            }
          >
            {spec.blurb}
          </p>

          <Link
            href={spec.href}
            className={
              "mt-8 inline-flex items-center gap-2 text-[13px] tracking-[0.18em] uppercase font-bold transition-colors w-fit " +
              (isDark
                ? "text-[var(--gold)] hover:text-[var(--gold-soft)]"
                : "text-[var(--bg-dark)] hover:text-[var(--gold-deep)]")
            }
          >
            Explore {spec.title}
            <ArrowUpRight size={16} />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
