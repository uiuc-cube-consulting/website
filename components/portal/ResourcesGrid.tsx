import {
  Presentation,
  BookOpen,
  FileText,
  Image as ImageIcon,
  ClipboardList,
  Users,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  presentation: Presentation,
  book: BookOpen,
  file: FileText,
  image: ImageIcon,
  clipboard: ClipboardList,
  users: Users,
};

type Resource = {
  title: string;
  description: string;
  href: string;
  icon: string;
};

export function ResourcesGrid({ items }: { items: readonly Resource[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {items.map((r) => {
        const Icon = ICONS[r.icon] ?? FileText;
        return (
          <a
            key={r.title}
            href={r.href}
            target="_blank"
            rel="noreferrer noopener"
            className="group rounded-2xl bg-white border border-[var(--border)] p-6 hover:shadow-xl hover:border-[var(--gold)] transition-all flex flex-col"
          >
            <div className="grid place-items-center w-12 h-12 rounded-xl bg-[var(--bg-cream)] text-[var(--bg-dark)] group-hover:bg-[var(--gold)] transition-colors">
              <Icon size={22} />
            </div>
            <h3 className="mt-5 font-display font-bold text-[var(--bg-dark)] text-lg">{r.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed flex-1">
              {r.description}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--gold-deep)] group-hover:gap-2 transition-all">
              Open <ExternalLink size={12} />
            </span>
          </a>
        );
      })}
    </div>
  );
}
