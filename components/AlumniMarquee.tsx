import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ALUMNI_PLACEMENTS } from "@/lib/content";

/**
 * Compact "Where alumni go" preview for the home page — two infinite-marquee
 * rows scrolling in opposite directions, drawn from /alumni logos. Encourages
 * prospective recruits to click through to the full About page wall.
 */
export function AlumniMarquee() {
  const half = Math.ceil(ALUMNI_PLACEMENTS.length / 2);
  const row1 = ALUMNI_PLACEMENTS.slice(0, half);
  const row2 = ALUMNI_PLACEMENTS.slice(half);

  return (
    <section className="relative isolate bg-[var(--bg-dark)] text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(720px 360px at 50% 0%, rgba(212,166,87,0.12), transparent 70%)",
        }}
      />

      <div className="container-x section-y">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-5">
            <p className="eyebrow">After CUBE</p>
            <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.05]">
              Where alumni land.
            </h2>
            <p className="mt-5 text-white/70 leading-relaxed max-w-md">
              The skills you build at CUBE translate. Our alumni go on to engineer at big tech,
              consult at top firms, and lead at high-growth startups.
            </p>
            <Link
              href="/about"
              className="mt-7 inline-flex items-center gap-2 text-[var(--gold)] hover:gap-3 transition-all text-sm font-semibold uppercase tracking-[0.18em]"
            >
              See the full list
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="lg:col-span-7 space-y-5">
            <AlumniRow items={row1} duration={42} reverse={false} />
            <AlumniRow items={row2} duration={48} reverse={true} />
          </div>
        </div>
      </div>
    </section>
  );
}

function AlumniRow({
  items,
  duration,
  reverse,
}: {
  items: { name: string; logo?: string }[];
  duration: number;
  reverse: boolean;
}) {
  const loop = [...items, ...items];

  return (
    <div className="relative marquee-mask marquee-pause">
      <div
        className="marquee-track"
        style={{
          ["--marquee-duration" as string]: `${duration}s`,
          animationDirection: reverse ? "reverse" : "normal",
        }}
      >
        {loop.map((brand, i) => (
          <div
            key={`${brand.name}-${i}`}
            className="shrink-0 px-5 md:px-7 flex items-center justify-center h-16 md:h-20"
          >
            <div className="relative h-10 md:h-12 w-24 md:w-32">
              {brand.logo ? (
                <Image
                  src={brand.logo}
                  alt={brand.name}
                  fill
                  sizes="140px"
                  className="object-contain opacity-80 hover:opacity-100 transition-opacity"
                />
              ) : (
                <span className="grid place-items-center w-full h-full font-display font-bold text-white/80 text-sm">
                  {brand.name}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
