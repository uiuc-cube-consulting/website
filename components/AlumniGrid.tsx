import Image from "next/image";
import { ALUMNI_PLACEMENTS } from "@/lib/content";

/**
 * "What Comes After CUBE?" — alumni placement logos rendered as a wall
 * matching the live site layout. Each tile is a transparent dark cell so
 * the white-foreground company logos read cleanly.
 */
export function AlumniGrid() {
  return (
    <section className="bg-[var(--bg-dark)] text-white">
      <div className="container-x section-y">
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow">After CUBE</p>
          <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.05]">
            What Comes After CUBE?
          </h2>
          <p className="mt-5 text-white/70 leading-relaxed">
            Our alumni embark on diverse professional paths, using the knowledge from CUBE to lead.
            They&apos;ve gone on to engineer at big tech, consult at top firms, and take on pivotal
            roles at high-growth companies.
          </p>
        </div>

        <ul className="mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-10 md:gap-y-12 items-center">
          {ALUMNI_PLACEMENTS.map((brand) => (
            <li
              key={brand.name}
              className="h-16 md:h-20 flex items-center justify-center"
            >
              {brand.logo ? (
                <div className="relative h-12 md:h-14 w-[80%]">
                  <Image
                    src={brand.logo}
                    alt={brand.name}
                    fill
                    sizes="140px"
                    className="object-contain opacity-90 hover:opacity-100 transition-opacity"
                  />
                </div>
              ) : (
                <span className="font-display font-bold text-white/85 text-sm md:text-base tracking-tight">
                  {brand.name}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
