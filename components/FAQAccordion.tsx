"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

type FAQ = { q: string; a: string };

export function FAQAccordion({ items }: { items: readonly FAQ[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white overflow-hidden">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <li key={i}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-center justify-between gap-4 text-left px-5 md:px-6 py-5 hover:bg-[var(--bg-cream)]/40 focus-visible:outline-2 focus-visible:outline-[var(--gold)]"
            >
              <span className="font-display font-semibold text-[var(--bg-dark)]">{item.q}</span>
              <ChevronDown
                size={18}
                className={clsx(
                  "shrink-0 text-[var(--muted)] transition-transform duration-200",
                  isOpen && "rotate-180 text-[var(--gold-deep)]"
                )}
              />
            </button>
            <div
              className={clsx(
                "grid transition-[grid-template-rows] duration-300 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <p className="px-5 md:px-6 pb-6 text-[15px] leading-relaxed text-[var(--muted)]">{item.a}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
