/**
 * Google Calendar iframe embed.
 *
 * Set `NEXT_PUBLIC_CALENDAR_EMBED_SRC` to the public embed URL from
 * Google Calendar (Settings → "Integrate calendar" → "Public URL to this
 * calendar" → "Embed code"). The src looks like:
 *   https://calendar.google.com/calendar/embed?src=<id>&ctz=America%2FChicago
 */
export function CalendarEmbed() {
  const src = process.env.NEXT_PUBLIC_CALENDAR_EMBED_SRC;

  if (!src) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-8 md:p-10 text-center">
        <p className="font-display font-bold text-[var(--bg-dark)]">Calendar not configured</p>
        <p className="mt-2 text-sm text-[var(--muted)] max-w-md mx-auto">
          Set <code className="px-1 py-0.5 rounded bg-[var(--bg-cream)] text-[var(--bg-dark)] font-mono text-xs">NEXT_PUBLIC_CALENDAR_EMBED_SRC</code>{" "}
          to the public embed URL from Google Calendar and redeploy.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
      <iframe
        src={src}
        title="CUBE Consulting calendar"
        loading="lazy"
        className="w-full h-[600px]"
        style={{ border: 0 }}
      />
    </div>
  );
}
