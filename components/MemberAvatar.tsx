import clsx from "clsx";
import Image from "next/image";
import { initials } from "@/lib/team";

/**
 * Oval, gold-framed member portrait. Renders a photo if one is provided,
 * otherwise falls back to monogrammed initials on a cream background.
 *
 * Drop photos under /public/members/<slug>.jpg to swap out placeholders.
 */
export function MemberAvatar({
  name,
  photo,
  size = "md",
  className,
}: {
  name: string;
  photo?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizing =
    size === "lg"
      ? "w-28 h-32"
      : size === "sm"
      ? "w-16 h-20"
      : "w-20 h-24 md:w-24 md:h-28";

  return (
    <div
      className={clsx(
        "relative overflow-hidden mx-auto",
        "rounded-[50%/50%]",
        "ring-[3px] ring-[var(--gold)] ring-offset-2 ring-offset-[var(--bg-cream)]",
        "bg-[var(--bg-cream)]",
        sizing,
        className
      )}
    >
      {photo ? (
        <Image
          src={photo}
          alt={name}
          fill
          sizes="112px"
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[var(--gold-soft)]/40 to-[var(--bg-cream)]">
          <span className="font-display font-extrabold text-2xl md:text-3xl text-[var(--gold-deep)]">
            {initials(name)}
          </span>
        </div>
      )}
    </div>
  );
}
