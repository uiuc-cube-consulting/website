import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { IntakeForm } from "@/features/03-recruitment-ats/components/IntakeForm";

export const metadata: Metadata = {
  title: "Apply",
  description: "Apply to join CUBE Consulting — UIUC's premier business and engineering consulting club.",
};

export default function ApplyPage() {
  return (
    <>
      <PageHero
        eyebrow="Recruitment"
        title="Apply to CUBE."
        blurb="Tell us a bit about you. Recruitment runs each semester across every college — engineers, business majors, designers, and scientists all welcome."
      />
      <section className="section-y bg-[var(--bg-cream)]/40">
        <div className="container-x max-w-3xl">
          <IntakeForm />
        </div>
      </section>
    </>
  );
}
