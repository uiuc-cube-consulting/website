import { Sprout, Target, Compass, Users } from "lucide-react";

const ICONS = {
  growth: Sprout,
  impact: Target,
  leadership: Compass,
  diversity: Users,
} as const;

export function PillarCard({ pillar }: { pillar: { key: string; title: string; blurb: string } }) {
  const Icon = ICONS[pillar.key as keyof typeof ICONS] ?? Sprout;
  return (
    <article className="group relative rounded-2xl bg-white border border-[var(--border)] p-6 md:p-7 hover:border-[var(--gold)] hover:shadow-[0_24px_60px_-30px_rgba(184,134,47,0.45)] hover:-translate-y-1 transition-all duration-300 overflow-hidden">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />
      <span
        aria-hidden
        className="absolute -right-12 -top-12 w-32 h-32 rounded-full bg-[var(--gold)]/0 group-hover:bg-[var(--gold)]/10 blur-2xl transition-colors duration-500"
      />

      <div className="relative grid place-items-center w-12 h-12 rounded-xl bg-[var(--bg-cream)] text-[var(--bg-dark)] group-hover:bg-[var(--gold)] group-hover:text-[var(--bg-dark)] group-hover:scale-105 transition-all duration-300">
        <Icon size={22} />
      </div>
      <h3 className="relative mt-5 font-display font-extrabold text-xl text-[var(--bg-dark)]">
        {pillar.title}
      </h3>
      <p className="relative mt-2 text-sm leading-relaxed text-[var(--muted)]">{pillar.blurb}</p>
    </article>
  );
}
