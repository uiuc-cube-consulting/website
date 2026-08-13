"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { OUTCOME_STAGES, STAGES, type StageKey } from "@/features/02-pipeline-crm/lib/pipeline";

type Props = {
  /** Bounding rect of the button that opened the menu — the menu anchors under it. */
  anchor: DOMRect;
  current: StageKey;
  onPick: (stage: StageKey) => void;
  onClose: () => void;
};

const MENU_W = 232;
const GAP = 6;
const EDGE = 8;

/**
 * Stage picker rendered into document.body. The board is a horizontal
 * `overflow-x-auto` scroller, so a normally-positioned popover would be clipped by
 * it — a fixed-position portal escapes that and can reach every stage, including the
 * two outcome buckets that sit off the right edge of the funnel.
 */
export function MoveMenu({ anchor, current, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure, then place: flip above the anchor when there isn't room below.
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    const below = anchor.bottom + GAP;
    const top = below + h > window.innerHeight - EDGE ? Math.max(EDGE, anchor.top - GAP - h) : below;
    const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - MENU_W - EDGE));
    setPos({ top, left });
  }, [anchor]);

  // Any scroll/resize invalidates the anchor rect, so close rather than float loose.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        role="menu"
        aria-label="Move to stage"
        style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_W }}
        className="fixed z-[61] overflow-hidden rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-xl"
      >
        <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Move to</p>
        {STAGES.map((s) => (
          <Row key={s.key} label={s.label} active={s.key === current} onClick={() => onPick(s.key)} />
        ))}
        <div className="my-1 border-t border-[var(--border)]" />
        <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Close out</p>
        {OUTCOME_STAGES.map((s) => (
          <Row key={s.key} label={s.label} active={s.key === current} muted onClick={() => onPick(s.key)} />
        ))}
      </div>
    </>,
    document.body
  );
}

function Row({
  label,
  active,
  muted,
  onClick,
}: {
  label: string;
  active: boolean;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={active}
      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors ${
        active
          ? "cursor-default font-semibold text-[var(--gold-deep)]"
          : muted
            ? "text-[var(--muted)] hover:bg-[var(--bg-cream)] hover:text-[var(--bg-dark)]"
            : "text-[var(--bg-dark)] hover:bg-[var(--bg-cream)]"
      }`}
    >
      {label}
      {active && <Check size={14} className="shrink-0" />}
    </button>
  );
}
