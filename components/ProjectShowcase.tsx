import Image from "next/image";
import type { Project } from "@/lib/content";

/**
 * Client engagement card.
 *
 * Previously this rendered a client's logo centered in a tall empty box and
 * nothing else, which told a prospective client exactly nothing. It now leads
 * with the work: a one-line summary of the engagement and the deliverables the
 * team is shipping.
 *
 * `summary` and `bullets` are optional — a card with neither falls back to a
 * compact logo tile rather than a large empty one, so a semester can start
 * before the write-ups land. Fill them in `lib/content.ts` as teams lock scope.
 */
export function ProjectShowcase({ project }: { project: Project }) {
  const hasDetail = Boolean(project.summary) || Boolean(project.bullets?.length);

  return (
    <article
      className={
        "group rounded-3xl bg-white border border-[var(--border)] overflow-hidden " +
        "transition-all hover:border-[var(--brand)] hover:shadow-[0_18px_40px_-24px_rgba(62,19,112,0.35)] " +
        (hasDetail ? "flex flex-col" : "")
      }
    >
      {/* Logo plate — cream so the logo reads, sized to the card's role */}
      <div
        className={
          "flex items-center justify-center bg-[var(--bg-cream)] px-8 " +
          (hasDetail ? "h-28 md:h-32" : "h-32 md:h-36")
        }
      >
        {project.logo ? (
          <div className="relative w-[62%] h-12 md:h-14">
            <Image
              src={project.logo}
              alt={project.name}
              fill
              sizes="(min-width:768px) 18rem, 45vw"
              className="object-contain"
            />
          </div>
        ) : (
          <span className="font-display font-extrabold text-2xl md:text-3xl text-[var(--bg-dark)] tracking-tight">
            {project.name}
          </span>
        )}
      </div>

      <div className="p-6 md:p-8 flex flex-col flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-display font-extrabold text-[var(--bg-dark)] text-xl md:text-2xl leading-tight">
            {project.name}
          </h3>
          {project.sector && (
            <span className="inline-flex items-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)] px-2.5 py-1 text-[10.5px] font-bold tracking-[0.16em] uppercase">
              {project.sector}
            </span>
          )}
        </div>

        {project.summary ? (
          <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--muted)]">
            {project.summary}
          </p>
        ) : (
          <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--muted)]">
            Engagement in flight this semester.
          </p>
        )}

        {project.bullets?.length ? (
          <>
            <p className="mt-6 text-[10.5px] font-bold tracking-[0.24em] uppercase text-[var(--brand)]">
              What we delivered
            </p>
            <ul className="mt-3 space-y-2.5 text-[14.5px] leading-relaxed text-[var(--bg-dark)]">
              {project.bullets.map((b) => (
                <li key={b} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold)]"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {project.teamImage && (
          <div className="mt-7 flex justify-center">
            <Image
              src={project.teamImage}
              alt={`${project.name} project team`}
              width={570}
              height={268}
              sizes="(min-width:768px) 28rem, 90vw"
              className="w-full max-w-md h-auto mx-auto rounded-xl"
            />
          </div>
        )}
      </div>
    </article>
  );
}
