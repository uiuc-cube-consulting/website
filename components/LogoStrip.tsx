import Image from "next/image";
import type { Brand } from "@/lib/content";

export function LogoStrip({
  title,
  items,
  variant = "light",
  marquee = true,
  duration = 32,
}: {
  title?: string;
  items: readonly Brand[];
  variant?: "light" | "dark";
  marquee?: boolean;
  duration?: number;
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

        {marquee ? (
          <MarqueeRow items={items} isDark={isDark} duration={duration} className="mt-8" />
        ) : (
          <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-10 md:gap-x-14 gap-y-6">
            {items.map((brand) => (
              <LogoItem key={brand.name} brand={brand} isDark={isDark} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function MarqueeRow({
  items,
  isDark,
  duration,
  className,
}: {
  items: readonly Brand[];
  isDark: boolean;
  duration: number;
  className?: string;
}) {
  // Duplicate the items so the translate animation can loop seamlessly.
  const loop = [...items, ...items];

  return (
    <div className={"relative marquee-mask marquee-pause " + (className ?? "")}>
      <div
        className="marquee-track"
        style={{ ["--marquee-duration" as string]: `${duration}s` }}
      >
        {loop.map((brand, i) => (
          <div
            key={`${brand.name}-${i}`}
            className="shrink-0 px-7 md:px-10 flex items-center justify-center h-14 md:h-16"
          >
            <LogoItem brand={brand} isDark={isDark} inline />
          </div>
        ))}
      </div>
    </div>
  );
}

function LogoItem({
  brand,
  isDark,
  inline = false,
}: {
  brand: Brand;
  isDark: boolean;
  inline?: boolean;
}) {
  const Wrapper = inline ? "div" : "li";

  if (brand.logo) {
    return (
      <Wrapper className={inline ? "" : "flex items-center justify-center h-14 md:h-16"}>
        <div className="relative h-12 md:h-14 w-28 md:w-36">
          <Image
            src={brand.logo}
            alt={brand.name}
            fill
            sizes="160px"
            className="object-contain opacity-85 hover:opacity-100 transition-opacity"
          />
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper className={inline ? "" : "flex items-center justify-center h-14 md:h-16"}>
      <span
        className={
          "font-display font-bold tracking-tight text-base md:text-lg " +
          (isDark ? "text-white/85" : "text-[var(--bg-dark)]/80")
        }
      >
        {brand.name}
      </span>
    </Wrapper>
  );
}
