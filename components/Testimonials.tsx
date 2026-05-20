import { TESTIMONIALS } from "@/lib/content";

export function Testimonials() {
  return (
    <section className="bg-[var(--bg-dark)] text-white">
      <div className="container-x section-y">
        <div className="max-w-2xl mx-auto text-center">
          <p className="eyebrow">In their words</p>
          <h2 className="mt-4 font-display font-extrabold text-4xl md:text-5xl leading-[1.05]">
            What clients say.
          </h2>
        </div>

        <div className="mt-14 grid md:grid-cols-3 gap-8 md:gap-10">
          {TESTIMONIALS.map((t, i) => (
            <blockquote key={i} className="text-center px-2 md:px-4">
              <span
                aria-hidden
                className="block font-display font-black text-[var(--gold)] text-7xl leading-none mb-3"
              >
                &ldquo;
              </span>
              <footer className="mb-4">
                <div className="font-display font-bold text-white text-[15px]">
                  {t.author}
                  {t.title && `, ${t.title}`}
                </div>
                <div className="text-[11px] tracking-[0.22em] uppercase text-[var(--gold)] mt-1">
                  {t.company}
                </div>
              </footer>
              <p className="text-white/80 text-[14px] leading-relaxed">{t.quote}</p>
            </blockquote>
          ))}
        </div>
      </div>
    </section>
  );
}
