"use client";

import { useEffect, useRef, useState } from "react";
import { STATS } from "@/lib/content";

function useInView<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setInView(true),
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

function Counter({ value, start }: { value: number; start: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!start) return;
    const duration = 1400;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, value]);
  return <span>{n.toLocaleString()}</span>;
}

export function StatsBar() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);

  return (
    <section
      ref={ref}
      className="relative isolate bg-[var(--bg-cream)] border-y border-[var(--border)] overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(600px 240px at 50% 100%, rgba(212,166,87,0.18), transparent 70%)",
        }}
      />

      <div className="container-x py-12 md:py-16 grid grid-cols-1 sm:grid-cols-3 text-center divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)]">
        {STATS.map((s, i) => (
          <div
            key={s.label}
            className="px-4 py-6 sm:py-2 group"
            style={{ transitionDelay: `${i * 60}ms` }}
          >
            <div className="relative inline-flex flex-col items-center">
              <div className="font-display font-extrabold text-5xl md:text-6xl text-[var(--bg-dark)] tracking-tight tabular-nums">
                <Counter value={s.value} start={inView} />
                {s.suffix}
              </div>
              <div
                aria-hidden
                className="mt-3 h-[3px] w-10 rounded-full bg-[var(--gold)]/70 origin-center transition-all duration-500 group-hover:w-16 group-hover:bg-[var(--gold)]"
              />
              <div className="mt-3 text-[11px] tracking-[0.28em] uppercase font-semibold text-[var(--muted)]">
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
