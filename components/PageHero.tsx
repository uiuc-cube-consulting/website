// Shared dark hero band used by inner pages (Projects, Services, About, etc.)

export function PageHero({
  eyebrow,
  title,
  blurb,
  children,
}: {
  eyebrow?: string;
  title: string;
  blurb?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative bg-[var(--bg-dark)] text-white overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(800px 400px at 80% 10%, var(--gold), transparent), radial-gradient(600px 300px at 10% 90%, var(--gold-soft), transparent)",
        }}
      />
      <div className="container-x relative py-20 md:py-28 lg:py-32">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-4 font-display font-extrabold text-white text-5xl md:text-6xl lg:text-7xl leading-[1.04] max-w-4xl">
          {title}
        </h1>
        {blurb && (
          <p className="mt-6 max-w-2xl text-white/75 text-[17px] leading-relaxed">{blurb}</p>
        )}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
