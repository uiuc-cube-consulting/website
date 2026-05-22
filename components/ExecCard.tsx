import Image from "next/image";
import { ExecMember, initials } from "@/lib/team";

export function ExecCard({ member }: { member: ExecMember }) {
  return (
    <article className="group rounded-2xl bg-white border border-[var(--border)] overflow-hidden hover:shadow-xl transition-shadow">
      <div className="aspect-[4/5] bg-gradient-to-br from-[var(--bg-cream)] to-white grid place-items-center relative">
        {member.photo ? (
          <Image
            src={member.photo}
            alt={member.name}
            fill
            sizes="(min-width:1024px) 25vw, (min-width:768px) 33vw, 50vw"
            className="object-cover"
          />
        ) : (
          <span aria-hidden className="font-display text-6xl font-extrabold text-[var(--gold)]/35 select-none">
            {initials(member.name)}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--gold)] origin-left scale-x-0 group-hover:scale-x-100 transition-transform" />
      </div>
      <div className="p-5">
        <h3 className="font-display font-extrabold text-[var(--bg-dark)]">{member.name}</h3>
        <p className="text-[11px] tracking-[0.22em] uppercase text-[var(--gold-deep)] font-bold mt-1">
          {member.role}
        </p>
        {member.quote && (
          <p className="mt-3 text-sm text-[var(--muted)] leading-relaxed italic">
            &ldquo;{member.quote}&rdquo;
          </p>
        )}
      </div>
    </article>
  );
}
