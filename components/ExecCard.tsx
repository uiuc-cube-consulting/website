"use client";

import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { ExecMember, initials } from "@/lib/team";

export function ExecCard({ member }: { member: ExecMember }) {
  const reduced = useReducedMotion();
  const [flipped, setFlipped] = useState(false);

  return (
    <div
      className="relative w-full aspect-[4/5]"
      style={{ perspective: 1200 }}
      onMouseEnter={() => !reduced && setFlipped(true)}
      onMouseLeave={() => !reduced && setFlipped(false)}
    >
      <motion.button
        type="button"
        aria-label={`Show responsibilities for ${member.role}`}
        aria-pressed={flipped}
        onClick={() => setFlipped((f) => !f)}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: reduced ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: "preserve-3d" }}
        className="relative block w-full h-full text-left rounded-2xl focus-visible:outline-2 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-2 cursor-pointer"
      >
        {/* FRONT */}
        <div
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className="absolute inset-0 rounded-2xl bg-white border border-[var(--border)] overflow-hidden shadow-[0_4px_18px_-12px_rgba(21,17,11,0.25)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-cream)] to-white">
            {member.photo ? (
              <Image
                src={member.photo}
                alt={member.name}
                fill
                sizes="(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw"
                className="object-cover"
              />
            ) : (
              <span className="absolute inset-0 grid place-items-center font-display text-6xl font-extrabold text-[var(--gold)]/35 select-none">
                {initials(member.name)}
              </span>
            )}
          </div>

          {/* Bottom gradient + meta */}
          <div className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-[rgba(21,17,11,0.85)] via-[rgba(21,17,11,0.45)] to-transparent text-white">
            <h3 className="font-display font-extrabold text-lg leading-tight">
              {member.name}
            </h3>
            <p className="text-[10.5px] tracking-[0.22em] uppercase text-[var(--gold)] font-bold mt-1">
              {member.role}
            </p>
          </div>

          {/* Flip hint chip */}
          <span
            aria-hidden
            className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 backdrop-blur-sm text-[10px] font-semibold tracking-wide text-[var(--bg-dark)] shadow-sm"
          >
            <RotateCw size={11} />
            Role
          </span>

          {/* Gold accent line */}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--gold)]"
          />
        </div>

        {/* BACK */}
        <div
          style={{
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
          className="absolute inset-0 rounded-2xl bg-[var(--bg-dark)] text-white p-5 md:p-6 flex flex-col overflow-hidden"
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--gold)]/70 to-transparent"
          />
          <span
            aria-hidden
            className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-[var(--gold)]/15 blur-2xl"
          />

          <p className="eyebrow text-[var(--gold)]">{member.role}</p>
          <h3 className="mt-2 font-display font-extrabold text-xl leading-tight">
            What they do
          </h3>

          <p className="mt-4 text-[14px] leading-relaxed text-white/85">
            {member.responsibilities}
          </p>

          <div className="mt-auto pt-5 flex items-center justify-between text-[10.5px] tracking-[0.22em] uppercase">
            <span className="font-bold text-[var(--gold)]">{member.name}</span>
            <span className="inline-flex items-center gap-1 text-white/55">
              <RotateCw size={11} />
              Flip back
            </span>
          </div>
        </div>
      </motion.button>
    </div>
  );
}
