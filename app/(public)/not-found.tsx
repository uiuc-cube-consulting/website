import Link from "next/link";

export default function NotFound() {
  return (
    <section className="section-y bg-white">
      <div className="container-x text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 font-display font-extrabold text-5xl md:text-6xl text-[var(--bg-dark)]">
          Page not found.
        </h1>
        <p className="mt-5 text-[var(--muted)]">
          The page you&apos;re looking for doesn&apos;t exist. Try one of the links below.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link href="/" className="btn btn-gold">Home</Link>
          <Link href="/projects" className="btn btn-gold-outline">Our Projects</Link>
        </div>
      </div>
    </section>
  );
}
