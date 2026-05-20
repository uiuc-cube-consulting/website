import Image from "next/image";
import Link from "next/link";
import { SITE } from "@/lib/content";

export function Hero() {
  return (
    <section className="relative isolate w-full overflow-hidden bg-[var(--bg-dark)] text-white">
      <Image
        src="/hero.JPG"
        alt="CUBE Consulting team"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center -z-10"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-[rgba(21,17,11,0.55)] via-[rgba(21,17,11,0.35)] to-[rgba(21,17,11,0.85)]"
      />

      <div className="container-x relative flex flex-col items-center justify-center text-center min-h-[78vh] md:min-h-[88vh] py-24 md:py-32">
        <h1 className="font-display font-extrabold text-white leading-[1.02] text-5xl sm:text-6xl md:text-7xl lg:text-[88px] tracking-tight max-w-5xl drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]">
          {SITE.tagline}
        </h1>

        <div className="mt-10 md:mt-12 flex flex-wrap items-center justify-center gap-3 md:gap-4">
          <Link href="/join-us" className="btn btn-gold">
            Recruitment Timeline
          </Link>
          <a
            href={SITE.applyForm}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-gold"
          >
            Apply Now
          </a>
          <a
            href={SITE.mailingListForm}
            target="_blank"
            rel="noreferrer noopener"
            className="btn btn-gold-outline"
          >
            Mailing List
          </a>
        </div>
      </div>
    </section>
  );
}
