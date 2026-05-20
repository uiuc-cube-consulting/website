import type { Brand } from "@/lib/content";

export function LogoStrip({
  title,
  items,
  variant = "light",
}: {
  title?: string;
  items: readonly Brand[];
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
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 md:gap-x-14 gap-y-6">
          {items.map((brand) => (
            <li key={brand.name} className="flex items-center justify-center h-14 md:h-16">
              {brand.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logo}
                  alt={brand.name}
                  className={
                    "max-h-12 md:max-h-14 w-auto object-contain " +
                    (isDark ? "opacity-90 hover:opacity-100" : "opacity-90 hover:opacity-100") +
                    " transition-opacity"
                  }
                />
              ) : (
                <span
                  className={
                    "font-display font-bold tracking-tight text-base md:text-lg " +
                    (isDark ? "text-white/85" : "text-[var(--bg-dark)]/80")
                  }
                >
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
