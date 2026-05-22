import Image from "next/image";
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
                <div className="relative h-12 md:h-14 w-28 md:w-36">
                  <Image
                    src={brand.logo}
                    alt={brand.name}
                    fill
                    sizes="160px"
                    className="object-contain opacity-90 hover:opacity-100 transition-opacity"
                  />
                </div>
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
