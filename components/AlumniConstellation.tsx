import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ALUMNI_PLACEMENTS } from "@/lib/content";

/**
 * All alumni placements at once, in a staggered constellation.
 *
 * Replaces the two counter-scrolling marquees. A marquee shows three logos at
 * a time and asks you to wait for the rest; this shows every one of them in a
 * single glance, which is the whole point of the section. It also screenshots
 * cleanly for social, which the moving version never could.
 *
 * The vertical offset on alternating columns is what keeps it from reading as
 * a plain grid -- it is a static transform, not animation, so it costs nothing
 * and works with reduced motion.
 *
 * Tiles are 3:2 rather than circles: most of these are wide wordmarks, and a
 * circle inscribes them so small they stop being legible, which defeats the
 * point of showing the placements at all.
 *
 * The tile ground is dark on purpose. Measuring ink contrast across all 24
 * files, 20 read better on --bg-dark than on white -- they are light-ink
 * assets built for dark backgrounds, and a white tile made them vanish. The
 * four dark-ink outliers carry `darkInk` in the data and render as a light
 * silhouette so the whole wall stays legible.
 */
export function AlumniConstellation() {
  return (
    <section className="relative isolate bg-[var(--bg-dark)] text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(720px 360px at 50% 0%, rgba(223,174,62,0.12), transparent 70%)",
        }}
      />

      <div className="container-x section-y">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14">
          <div className="lg:col-span-4">
            <p className="eyebrow eyebrow-on-dark">After CUBE</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.05]">
              Where alumni land.
            </h2>
            <p className="mt-5 text-white/70 leading-relaxed max-w-md">
              The skills you build at CUBE translate. Our alumni go on to engineer
              at big tech, consult at top firms, and lead at high-growth startups.
            </p>
            <Link
              href="/about"
              className="mt-7 inline-flex items-center gap-2 text-[var(--gold)] hover:gap-3 transition-all text-sm font-semibold uppercase tracking-[0.18em]"
            >
              See the full list
              <ArrowRight size={16} />
            </Link>
          </div>

          <ul className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {ALUMNI_PLACEMENTS.map((brand, i) => (
              <li
                key={brand.name}
                className="constellation__cell grid place-items-center aspect-[3/2] rounded-2xl bg-white/[0.055] border border-white/[0.09] px-4 py-3 transition-colors hover:bg-white/[0.1] hover:border-[var(--gold)]/40"
                style={{ ["--col" as string]: i % 2 }}
                title={brand.name}
              >
                {brand.mono ? (
                  /* Single-colour mark: mask it so the logo takes the ink
                     colour of the wall rather than whatever the file ships. */
                  <>
                    <span
                      aria-hidden
                      className="block w-[82%] h-[76%] bg-white/90"
                      style={{
                        WebkitMaskImage: `url(${brand.logo})`,
                        maskImage: `url(${brand.logo})`,
                        WebkitMaskRepeat: "no-repeat",
                        maskRepeat: "no-repeat",
                        WebkitMaskPosition: "center",
                        maskPosition: "center",
                        WebkitMaskSize: "contain",
                        maskSize: "contain",
                      }}
                    />
                    <span className="sr-only">{brand.name}</span>
                  </>
                ) : brand.logo ? (
                  /* Wordmarks are wide; a circle forced them to render tiny.
                     A 3:2 tile lets the logo take most of the width. */
                  <div className="relative w-[86%] h-[62%]">
                    <Image
                      src={brand.logo}
                      alt={brand.name}
                      fill
                      sizes="(min-width:1024px) 180px, 40vw"
                      className={
                        "object-contain " +
                        (brand.darkInk ? "brightness-0 invert" : "")
                      }
                    />
                  </div>
                ) : (
                  <span className="font-display font-bold text-[var(--bg-dark)] text-[11px] text-center leading-tight">
                    {brand.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
