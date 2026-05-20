"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function PhotoCarousel({ images }: { images: { src: string; alt: string }[] }) {
  const [emblaRef, embla] = useEmblaCarousel({ loop: true, align: "start" });
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

  if (images.length === 0) return null;

  return (
    <div className="relative">
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {images.map((img, i) => (
            <div key={i} className="relative shrink-0 grow-0 basis-full md:basis-1/2 lg:basis-1/3 px-2">
              <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-[var(--brand-cream)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.src}
                  alt={img.alt}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="lazy"
                />
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
        className="absolute left-1 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-white shadow-md text-[var(--brand-navy)] disabled:opacity-40 hover:bg-[var(--brand-navy)] hover:text-white transition-colors"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        type="button"
        aria-label="Next"
        disabled={!canNext}
        onClick={() => embla?.scrollNext()}
        className="absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-full bg-white shadow-md text-[var(--brand-navy)] disabled:opacity-40 hover:bg-[var(--brand-navy)] hover:text-white transition-colors"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
