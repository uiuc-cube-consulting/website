import { ALUMNI_PLACEMENTS } from "@/lib/content";

/**
 * "What Comes After CUBE?" — alumni placement logos.
 * Currently renders styled name chips; swap to <img> once you drop logo
 * files into /public/alumni/<slug>.svg and add a `logo` field per item.
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

        <ul className="mt-12 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
          {ALUMNI_PLACEMENTS.map((name) => (
            <li
              key={name}
              className="aspect-[5/2] rounded-xl bg-white/[0.04] border border-white/[0.08] grid place-items-center text-center px-3"
            >
              <span className="font-display font-bold text-white/85 text-sm md:text-base tracking-tight">
                {name}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
