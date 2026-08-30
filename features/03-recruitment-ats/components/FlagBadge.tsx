import type { Flag } from "../lib/types";

// A compact red/green flag indicator for a candidate, for use in LISTS — next to
// a name, where there is room for a glance and not for a sentence.
//
// The full flags, with their notes and authors, live in the FlagPanel on the
// candidate's profile. This is deliberately not a summary of those: it answers
// only "has anyone raised something, and how many people?", which is the
// question you have while scanning a list of 150 names. Anything more would
// need reading, and reading belongs on the profile.
//
// Volume is shown by REPEATING the glyph rather than printing a number, because
// three green flags should look different from one at a glance, without the
// reader parsing a digit. Past `MAX_GLYPHS` that stops scaling — five flags and
// six flags look identical and the row starts to wrap — so the tail becomes a
// count. Two people flagging someone is a materially different signal from one,
// which is exactly the distinction the repetition preserves.

/** Beyond this many, repetition stops reading as volume and starts wrapping. */
const MAX_GLYPHS = 3;

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 8 10" width="8" height="10" aria-hidden className={className} focusable="false">
      {/* Pole + pennant. Drawn rather than an emoji: 🚩 has no green variant, and
          its colour is decided by the reader's font, not by us. */}
      <path d="M1 0v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
      <path d="M1.8 0.6h5.4L5.6 3l1.6 2.4H1.8z" fill="currentColor" />
    </svg>
  );
}

function Cluster({ count, tone }: { count: number; tone: "green" | "red" }) {
  if (count <= 0) return null;
  const shown = Math.min(count, MAX_GLYPHS);
  const color = tone === "green" ? "text-emerald-600" : "text-red-600";
  return (
    <span className={`inline-flex items-center gap-[1px] ${color}`}>
      {Array.from({ length: shown }, (_, i) => (
        <FlagIcon key={i} />
      ))}
      {count > MAX_GLYPHS && (
        <span className="ml-[1px] text-[10px] font-semibold tabular-nums leading-none">+{count - MAX_GLYPHS}</span>
      )}
    </span>
  );
}

/** Plain-language count, so the badge is not colour-only. */
function describe(green: number, red: number): string {
  const parts: string[] = [];
  if (green) parts.push(`${green} green flag${green === 1 ? "" : "s"}`);
  if (red) parts.push(`${red} red flag${red === 1 ? "" : "s"}`);
  return parts.join(", ");
}

export function FlagBadge({ flags, className = "" }: { flags: Flag[]; className?: string }) {
  const green = flags.filter((f) => f.color === "green").length;
  const red = flags.filter((f) => f.color === "red").length;
  if (green + red === 0) return null;

  const label = describe(green, red);
  return (
    // Red first: a concern is the thing you must not miss while skimming, and
    // left is where the eye lands. Colour alone never carries the meaning —
    // there is a text label underneath for screen readers, and the two clusters
    // differ in position as well as hue, so red/green colour blindness does not
    // make them indistinguishable.
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1.5 align-middle ${className}`}
    >
      <Cluster count={red} tone="red" />
      <Cluster count={green} tone="green" />
    </span>
  );
}
