import { MemberAvatar } from "./MemberAvatar";
import type { Project } from "@/lib/content";

/**
 * Rich project card — client logo at top, then a row of team members in
 * gold-framed oval frames (role label above, name + year below), and a
 * short bullet list describing the engagement.
 */
export function ProjectShowcase({ project }: { project: Project }) {
  return (
    <article className="rounded-3xl bg-[var(--bg-cream)] border border-[var(--border)] p-6 md:p-9 hover:shadow-xl transition-shadow">
      <div className="h-16 flex items-center justify-center">
        {project.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.logo}
            alt={project.name}
            className="max-h-14 max-w-[60%] object-contain"
          />
        ) : (
          <span className="font-display font-extrabold text-3xl md:text-4xl text-[var(--bg-dark)] tracking-tight">
            {project.name}
          </span>
        )}
      </div>

      {project.team && project.team.length > 0 && (
        <div className="mt-8 grid grid-cols-3 gap-3 md:gap-4">
          {project.team.map((m) => (
            <div key={m.name} className="text-center">
              <p className="text-[10px] md:text-xs font-bold tracking-[0.18em] uppercase text-[var(--gold-deep)] mb-2">
                {m.role}
              </p>
              <MemberAvatar name={m.name} photo={m.photo} />
              <p className="mt-3 font-display font-bold text-sm md:text-base text-[var(--bg-dark)] leading-tight">
                {m.name}
              </p>
              {m.year && (
                <p className="text-[11px] md:text-xs text-[var(--muted)] mt-0.5">{m.year}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <ul className="mt-7 space-y-2.5 text-[15px] leading-relaxed text-[var(--bg-dark)]">
        {project.bullets.map((b, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden className="text-[var(--gold)] font-bold mt-0.5">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
