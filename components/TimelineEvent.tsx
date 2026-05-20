export function TimelineEvent({ date, event, last }: { date: string; event: string; last?: boolean }) {
  return (
    <li className="relative pl-10 pb-7 last:pb-0">
      <span
        aria-hidden
        className="absolute left-3 top-1.5 w-3 h-3 rounded-full bg-[var(--gold)] ring-4 ring-[var(--bg-cream)]"
      />
      {!last && (
        <span aria-hidden className="absolute left-[1.05rem] top-5 bottom-0 w-px bg-[var(--border)]" />
      )}
      <div className="text-[11px] font-bold tracking-[0.22em] uppercase text-[var(--gold-deep)]">{date}</div>
      <div className="mt-1 text-[var(--bg-dark)] font-medium">{event}</div>
    </li>
  );
}
