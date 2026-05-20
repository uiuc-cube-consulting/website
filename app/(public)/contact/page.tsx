import type { Metadata } from "next";
import { Mail, Link2 } from "lucide-react";
import { LinkedinIcon, InstagramIcon } from "@/components/SocialIcons";
import { ContactForm } from "@/components/ContactForm";
import { PageHero } from "@/components/PageHero";
import { SITE } from "@/lib/content";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with CUBE Consulting at UIUC.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Say hi"
        title="Let's get in touch."
        blurb="Whether you&rsquo;re hiring CUBE for a project, exploring a partnership, or just want to learn more about the org, drop us a message."
      />

      <section className="section-y bg-white">
        <div className="container-x grid lg:grid-cols-12 gap-10">
          <aside className="lg:col-span-5 space-y-4">
            <a
              href={`mailto:${SITE.email}`}
              className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-white p-5 hover:border-[var(--gold)] transition-colors"
            >
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--bg-cream)] text-[var(--bg-dark)] shrink-0">
                <Mail size={18} />
              </span>
              <span>
                <span className="block text-xs tracking-[0.25em] uppercase text-[var(--muted)] font-semibold">Email</span>
                <span className="font-medium text-[var(--bg-dark)]">{SITE.email}</span>
              </span>
            </a>
            <a
              href={SITE.linkedin}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-white p-5 hover:border-[var(--gold)] transition-colors"
            >
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--bg-cream)] text-[var(--bg-dark)] shrink-0">
                <LinkedinIcon width={18} height={18} />
              </span>
              <span>
                <span className="block text-xs tracking-[0.25em] uppercase text-[var(--muted)] font-semibold">LinkedIn</span>
                <span className="font-medium text-[var(--bg-dark)]">CUBE Consulting</span>
              </span>
            </a>
            <a
              href={SITE.instagram}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-white p-5 hover:border-[var(--gold)] transition-colors"
            >
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--bg-cream)] text-[var(--bg-dark)] shrink-0">
                <InstagramIcon width={18} height={18} />
              </span>
              <span>
                <span className="block text-xs tracking-[0.25em] uppercase text-[var(--muted)] font-semibold">Instagram</span>
                <span className="font-medium text-[var(--bg-dark)]">@cubeconsulting_</span>
              </span>
            </a>
            <a
              href={SITE.linktree}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-start gap-4 rounded-2xl border border-[var(--border)] bg-white p-5 hover:border-[var(--gold)] transition-colors"
            >
              <span className="grid place-items-center w-11 h-11 rounded-xl bg-[var(--bg-cream)] text-[var(--bg-dark)] shrink-0">
                <Link2 size={18} />
              </span>
              <span>
                <span className="block text-xs tracking-[0.25em] uppercase text-[var(--muted)] font-semibold">Linktree</span>
                <span className="font-medium text-[var(--bg-dark)]">Everywhere else</span>
              </span>
            </a>
          </aside>

          <div className="lg:col-span-7">
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}
