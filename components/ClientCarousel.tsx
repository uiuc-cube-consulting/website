"use client";

import useEmblaCarousel from "embla-carousel-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Brand } from "@/lib/content";

/**
 * Horizontal scrolling strip of client logos. Falls back to a styled text
 * chip when a brand has no logo file.
 */
export function ClientCarousel({ items }: { items: readonly Brand[] }) {
  const [emblaRef, embla] = useEmblaCarousel({
    loop: true,
    align: "start",
    dragFree: true,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!embla) return;
    setCanPrev(embla.canScrollPrev());
    setCanNext(embla.canScrollNext());
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    onSelect();
    embla.on("select", onSelect);
    embla.on("reInit", onSelect);
  }, [embla, onSelect]);

  return (
    <div className="relative">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-3 md:gap-4">
          {items.map((c, i) => (
            <div
              key={i}
              className="shrink-0 grow-0 basis-[42%] sm:basis-[28%] md:basis-[20%] lg:basis-[16%]"
            >
              <div className="h-24 md:h-28 rounded-xl bg-white border border-[var(--border)] flex items-center justify-center px-4 hover:shadow-md transition-shadow">
                {c.logo ? (
                  <div className="relative h-14 w-full">
                    <Image
                      src={c.logo}
                      alt={c.name}
                      fill
                      sizes="200px"
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <span className="font-display font-bold text-[var(--bg-dark)] text-sm md:text-base text-center tracking-tight">
                    {c.name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        aria-label="Previous"
        disabled={!canPrev}
        onClick={() => embla?.scrollPrev()}
        className="absolute -left-3 md:-left-5 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-[var(--gold)] text-[var(--bg-dark)] shadow-lg disabled:opacity-30 hover:bg-[var(--gold-deep)] hover:text-white transition-colors"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        aria-label="Next"
        disabled={!canNext}
        onClick={() => embla?.scrollNext()}
        className="absolute -right-3 md:-right-5 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-[var(--gold)] text-[var(--bg-dark)] shadow-lg disabled:opacity-30 hover:bg-[var(--gold-deep)] hover:text-white transition-colors"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
