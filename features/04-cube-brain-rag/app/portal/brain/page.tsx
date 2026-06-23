import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrainChat } from "@/features/04-cube-brain-rag/components/BrainChat";

export const metadata: Metadata = {
  title: "CUBE Brain",
  robots: { index: false, follow: false },
};

export default async function BrainPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Knowledge assistant</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          CUBE Brain.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Ask how CUBE has tackled a problem before and get an answer grounded in our past
          engagements, with sources. Internal &amp; members-only — don&rsquo;t share answers
          containing client details outside the org.
        </p>
      </div>
      <div className="mt-8">
        <BrainChat />
      </div>
    </div>
  );
}
