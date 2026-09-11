"use client";

import { Briefcase, Code2, PenTool, type LucideIcon } from "lucide-react";
import { SERVICE_CATEGORIES } from "@/lib/content";

const ICONS: LucideIcon[] = [Briefcase, Code2, PenTool];

/**
 * Three practices as a sticky card stack.
 *
 * Each card pins under the header and the next one slides up over it, so three
 * screens of content occupy one screen of attention and the sequence itself
 * says "these are parallel options, not steps." Replaces the alternating
 * editorial rows, which read as three unrelated sections.
 *
 * Surfaces are tints of the approved palette -- cream, lavender, gold -- so a
 * card is identifiable at a glance without introducing a new hue. Each card is
 * opaque, which is what makes the stack read.
 */
const SURFACES = [
  { bg: "var(--bg-cream)", chip: "var(--bg-dark)", chipText: "var(--gold)" },
  { bg: "color-mix(in srgb, var(--lavender) 20%, #ffffff)", chip: "var(--brand)", chipText: "#ffffff" },
  { bg: "color-mix(in srgb, var(--gold) 18%, #ffffff)", chip: "var(--bg-dark)", chipText: "var(--gold)" },
];

export function ServicePractices() {
  return (
    <ol className="practice-stack">
      {SERVICE_CATEGORIES.map((cat, i) => {
        const Icon = ICONS[i] ?? Briefcase;
        const skin = SURFACES[i] ?? SURFACES[0];

        return (
          <li
            key={cat.title}
            className="practice-stack__item"
            style={{ ["--i" as string]: i }}
          >
            <article
              className="rounded-3xl border border-[var(--border)] overflow-hidden shadow-[0_24px_60px_-40px_rgba(21,17,11,0.55)]"
              style={{ background: skin.bg }}
            >
              <div className="grid lg:grid-cols-12 gap-8 lg:gap-10 p-7 md:p-11 lg:p-14">
                <div className="lg:col-span-5">
                  <div className="flex items-center gap-4">
                    <span
                      className="grid place-items-center w-14 h-14 rounded-2xl shrink-0"
                      style={{ background: skin.chip, color: skin.chipText }}
                    >
                      <Icon size={26} strokeWidth={1.5} />
                    </span>
                    <span className="font-display font-black text-[3.4rem] leading-none text-[var(--bg-dark)]/15 tracking-tight select-none tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>

                  <h3 className="mt-6 font-display font-extrabold text-4xl md:text-5xl text-[var(--bg-dark)] leading-[1.02]">
                    {cat.title}.
                  </h3>
                  <p className="mt-4 text-[16.5px] leading-relaxed text-[var(--muted)] max-w-md">
                    {cat.blurb}
                  </p>
                </div>

                <div className="lg:col-span-7 lg:pl-6">
                  <p className="text-[10.5px] font-bold tracking-[0.24em] uppercase text-[var(--muted)]">
                    What that covers
                  </p>
                  <ul className="mt-4 grid sm:grid-cols-2 gap-x-8 gap-y-1">
                    {cat.points.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-3 py-3 border-b border-[var(--bg-dark)]/10"
                      >
                        <span
                          aria-hidden
                          className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--gold-deep)]"
                        />
                        <span className="text-[15px] text-[var(--bg-dark)] font-medium">
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ol>
  );
}
