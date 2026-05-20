export function LogoStrip({
  title,
  items,
  variant = "light",
}: {
  title?: string;
  items: readonly string[];
  variant?: "light" | "dark";
}) {
  const isDark = variant === "dark";
  return (
    <section className={isDark ? "bg-[var(--bg-dark)] text-white" : "bg-[var(--bg-cream)]"}>
      <div className="container-x py-12 md:py-16">
        {title && (
          <h3
            className={
              "text-xs font-bold tracking-[0.28em] uppercase text-center " +
              (isDark ? "text-[var(--gold)]" : "text-[var(--gold-deep)]")
            }
          >
            {title}
          </h3>
        )}
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {items.map((name) => (
            <li
              key={name}
              className={
                "font-display font-bold tracking-tight text-base md:text-lg " +
                (isDark ? "text-white/85" : "text-[var(--bg-dark)]/80")
              }
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
