export function TimelineEvent({
  date,
  event,
  last,
}: {
  date: string;
  event: string;
  last?: boolean;
}) {
  return (
    <li className="group relative pl-12 pb-7 last:pb-0">
      <span
        aria-hidden
        className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-[var(--gold)] ring-4 ring-[var(--bg-cream)] shadow-[0_0_0_2px_rgba(212,166,87,0.25)] group-hover:scale-110 group-hover:shadow-[0_0_0_4px_rgba(212,166,87,0.35)] transition-all duration-300"
      />
      {!last && (
        <span
          aria-hidden
          className="absolute left-[1.12rem] top-5 bottom-0 w-px bg-gradient-to-b from-[var(--gold)]/55 via-[var(--gold)]/20 to-transparent"
        />
      )}
      <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[var(--gold-deep)]">
        {date}
      </div>
      <div className="mt-1 text-[var(--bg-dark)] font-medium group-hover:text-[var(--bg-dark)] transition-colors">
        {event}
      </div>
    </li>
  );
}
