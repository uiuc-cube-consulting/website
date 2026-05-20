import { Code2, Briefcase, PenTool } from "lucide-react";
import { SOLUTION_AREAS } from "@/lib/content";

const ICONS = {
  engineering: Code2,
  business: Briefcase,
  design: PenTool,
} as const;

export function MultidisciplinarySolutions() {
  return (
    <section className="bg-[var(--bg-dark)] text-white">
      <div className="container-x section-y">
        <div className="text-center max-w-2xl mx-auto">
          <p className="eyebrow">What we deliver</p>
          <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.05]">
            Multidisciplinary Solutions.
          </h2>
        </div>

        <div className="mt-14 grid lg:grid-cols-3 gap-y-12 lg:gap-x-10">
          {SOLUTION_AREAS.map((area, i) => {
            const Icon = ICONS[area.key as keyof typeof ICONS] ?? Code2;
            return (
              <div
                key={area.key}
                className="flex flex-col items-center text-center lg:items-start lg:text-left"
                style={{
                  // Stagger the layout slightly like the live site (icon on alternating sides on lg).
                  order: i,
                }}
              >
                <div className="grid place-items-center w-20 h-20 rounded-2xl border border-[var(--gold)]/40 bg-[var(--bg-dark-2)] text-[var(--gold)]">
                  <Icon size={36} strokeWidth={1.5} />
                </div>
                <h3 className="mt-6 font-display font-extrabold text-2xl text-white">
                  {area.title}
                </h3>
                <p className="mt-3 max-w-sm text-white/70 text-[15px] leading-relaxed">
                  {area.blurb}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
