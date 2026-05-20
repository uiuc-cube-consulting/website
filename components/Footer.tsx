import Link from "next/link";
import Image from "next/image";
import { Link2, Mail } from "lucide-react";
import { LinkedinIcon, InstagramIcon } from "./SocialIcons";
import { SITE, NAV_LINKS, PARTNER_LOGOS } from "@/lib/content";

export function Footer() {
  return (
    <footer className="mt-auto bg-[var(--bg-dark)] text-[var(--fg-on-dark)]">
      <div className="container-x py-14 md:py-20 grid gap-10 md:gap-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/cube-logo.png" alt="" width={48} height={48} className="w-10 h-10" />
            <span className="font-display font-extrabold tracking-[0.04em] leading-[1.02] text-[15px]">
              <span className="block">CUBE</span>
              <span className="block">CONSULTING</span>
            </span>
          </Link>
          <p className="mt-5 max-w-md text-sm text-[var(--fg-on-dark)]/70 leading-relaxed">
            {SITE.longName} — a student-run consulting organization at the University of Illinois
            at Urbana-Champaign.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <a
              href={SITE.linkedin}
              aria-label="LinkedIn"
              target="_blank"
              rel="noreferrer noopener"
              className="p-2.5 rounded-full bg-white/[0.06] hover:bg-[var(--gold)] hover:text-[var(--bg-dark)] transition-colors"
            >
              <LinkedinIcon width={18} height={18} />
            </a>
            <a
              href={SITE.instagram}
              aria-label="Instagram"
              target="_blank"
              rel="noreferrer noopener"
              className="p-2.5 rounded-full bg-white/[0.06] hover:bg-[var(--gold)] hover:text-[var(--bg-dark)] transition-colors"
            >
              <InstagramIcon width={18} height={18} />
            </a>
            <a
              href={SITE.linktree}
              aria-label="Linktree"
              target="_blank"
              rel="noreferrer noopener"
              className="p-2.5 rounded-full bg-white/[0.06] hover:bg-[var(--gold)] hover:text-[var(--bg-dark)] transition-colors"
            >
              <Link2 size={18} />
            </a>
            <a
              href={`mailto:${SITE.email}`}
              aria-label="Email"
              className="p-2.5 rounded-full bg-white/[0.06] hover:bg-[var(--gold)] hover:text-[var(--bg-dark)] transition-colors"
            >
              <Mail size={18} />
            </a>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold tracking-[0.25em] uppercase text-[var(--gold)]">Site</h3>
          <ul className="mt-4 space-y-2.5 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-[var(--fg-on-dark)]/70 hover:text-[var(--gold)]">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-semibold tracking-[0.25em] uppercase text-[var(--gold)]">Affiliations</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-[var(--fg-on-dark)]/70">
            {PARTNER_LOGOS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="mt-6 text-sm">
            <a href={`mailto:${SITE.email}`} className="text-[var(--fg-on-dark)] hover:text-[var(--gold)]">
              {SITE.email}
            </a>
          </p>
        </div>
      </div>

      <div className="border-t border-[var(--border-dark)]">
        <div className="container-x py-5 text-xs text-[var(--fg-on-dark)]/55 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <span>© {SITE.copyrightYear} {SITE.name}. All rights reserved.</span>
          <span>Built and maintained by CUBE.</span>
        </div>
      </div>
    </footer>
  );
}
