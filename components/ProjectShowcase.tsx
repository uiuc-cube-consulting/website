import type { Project } from "@/lib/content";

/**
 * Project card matching the live site: client logo at top, pre-rendered team
 * composite (gold-framed photo card with names + roles drawn in), then a bullet
 * list of what the team is delivering this semester.
 *
 * To swap a team photo: drop a new file at /public/projects/team-<slug>.png and
 * update the `teamImage` path in lib/content.ts.
 */
export function ProjectShowcase({ project }: { project: Project }) {
  return (
    <article className="rounded-3xl bg-[var(--bg-cream)] border border-[var(--border)] p-6 md:p-9 hover:shadow-xl transition-shadow flex flex-col">
      <div className="h-20 md:h-24 flex items-center justify-center">
        {project.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.logo}
            alt={project.name}
            className="max-h-16 md:max-h-20 max-w-[65%] object-contain"
          />
        ) : (
          <span className="font-display font-extrabold text-3xl md:text-4xl text-[var(--bg-dark)] tracking-tight">
            {project.name}
          </span>
        )}
      </div>

      {project.teamImage && (
        <div className="mt-7 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={project.teamImage}
            alt={`${project.name} project team`}
            className="w-full max-w-md mx-auto"
            loading="lazy"
          />
        </div>
      )}

      <ul className="mt-7 space-y-3 text-[15px] leading-relaxed text-[var(--bg-dark)]">
        {project.bullets.map((b, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="text-[var(--gold-deep)] font-extrabold mt-0.5">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
