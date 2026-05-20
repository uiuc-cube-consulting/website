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
      className="bg-[var(--bg-cream)] border-y border-[var(--border)]"
    >
      <div className="container-x py-12 md:py-16 grid grid-cols-1 sm:grid-cols-3 gap-10 text-center">
        {STATS.map((s) => (
          <div key={s.label}>
            <div className="font-display font-extrabold text-5xl md:text-6xl text-[var(--bg-dark)]">
              <Counter value={s.value} start={inView} />
              {s.suffix}
            </div>
            <div className="mt-2 text-[11px] tracking-[0.28em] uppercase font-semibold text-[var(--muted)]">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
