/**
 * Static photo collage. Mosaic layout with subtle hover lifts.
 * Pass 5+ images for the best result.
 */
export function PhotoGallery({
  images,
}: {
  images: { src: string; alt: string }[];
}) {
  const [a, b, c, d, e] = images;
  return (
    <div className="grid grid-cols-4 grid-rows-2 gap-3 md:gap-4 h-[280px] md:h-[440px]">
      <Tile img={a} className="col-span-2 row-span-2" />
      <Tile img={b} className="col-span-2 row-span-1" />
      <Tile img={c} className="col-span-1 row-span-1" />
      <Tile img={d} className="col-span-1 row-span-1" />
      <Tile img={e} className="col-span-2 row-span-1 hidden md:block" />
    </div>
  );
}

function Tile({
  img,
  className = "",
}: {
  img?: { src: string; alt: string };
  className?: string;
}) {
  if (!img) return null;
  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl bg-[var(--bg-cream)] " + className
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.src}
        alt={img.alt}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 hover:scale-105"
        loading="lazy"
      />
    </div>
  );
}
