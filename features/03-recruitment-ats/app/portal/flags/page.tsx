import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { FlagIntake } from "@/features/03-recruitment-ats/components/FlagIntake";
import { canFlag } from "@/features/03-recruitment-ats/lib/access";

export const metadata: Metadata = {
  title: "Flags",
  robots: { index: false, follow: false },
};

/**
 * Standalone flag intake — deliberately NOT behind the recruiting visibility
 * toggle, unlike /portal/recruiting.
 *
 * The recruiting console is a cycle-scoped surface: it opens when applications
 * open and closes when decisions are done. Flags aren't cycle-scoped. The most
 * valuable ones are filed at an info night in August, months before there is an
 * applicant row to attach them to, and the console is closed for that entire
 * window. So this page stands on its own and stays open year-round; the gate it
 * keeps is the role check, which is the same club-wide baseline as flagging from
 * a candidate's profile.
 */
export default async function FlagsPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");
  if (!canFlag(session.user.role)) redirect("/portal");

  return (
    <div className="container-x py-10 md:py-14">
      <div>
        <p className="eyebrow">Recruiting</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Red &amp; green flags.
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Flag anyone by email, whenever you notice something — after an info night, a coffee chat,
          a callout. You don&apos;t have to wait for them to apply: the flag waits for them, and
          attaches itself to their profile the moment an application arrives from that address.
        </p>
      </div>
      <div className="mt-8">
        <FlagIntake />
      </div>
    </div>
  );
}
