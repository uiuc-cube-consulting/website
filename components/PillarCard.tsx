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
    <article className="group rounded-2xl bg-white border border-[var(--border)] p-6 md:p-7 hover:border-[var(--gold)] hover:shadow-md transition-all">
      <div className="grid place-items-center w-12 h-12 rounded-xl bg-[var(--bg-cream)] text-[var(--bg-dark)] group-hover:bg-[var(--gold)] group-hover:text-[var(--bg-dark)] transition-colors">
        <Icon size={22} />
      </div>
      <h3 className="mt-5 font-display font-extrabold text-xl text-[var(--bg-dark)]">{pillar.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{pillar.blurb}</p>
    </article>
  );
}
