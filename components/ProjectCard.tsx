export function ProjectCard({ project }: { project: { name: string; blurb: string } }) {
  return (
    <article className="rounded-2xl bg-white border border-[var(--border)] p-6 md:p-7 hover:shadow-xl hover:border-[var(--gold)] transition-all">
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="w-10 h-10 rounded-lg bg-[var(--bg-dark)] text-[var(--gold)] grid place-items-center font-display font-extrabold"
        >
          {project.name.slice(0, 1)}
        </div>
        <h3 className="font-display font-extrabold text-lg text-[var(--bg-dark)]">{project.name}</h3>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{project.blurb}</p>
    </article>
  );
}
