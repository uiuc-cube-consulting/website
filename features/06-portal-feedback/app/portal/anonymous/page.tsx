import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AnonymousNoteForm } from "@/features/06-portal-feedback/components/AnonymousNoteForm";
import { anonymousRecipients } from "@/features/06-portal-feedback/lib/anonymous-email";

export const metadata: Metadata = {
  title: "Anonymous Note",
  robots: { index: false, follow: false },
};

export default async function AnonymousNotePage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/portal/sign-in");

  // Named on the page, not just in the code. "Goes to exec" is vague enough
  // that a member has to guess whether the person they want to talk about is
  // one of the people reading it.
  const recipients = anonymousRecipients();

  return (
    <div className="container-x py-10 md:py-14">
      <div className="max-w-2xl">
        <p className="eyebrow">Member portal</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] text-[var(--bg-dark)] md:text-5xl">
          Say it anonymously.
        </h1>
        <p className="mt-4 text-[var(--muted)]">
          Anything you want the exec board to know and would rather not put your name to — a
          concern about how something was handled, something a member did, how the club is being
          run, or an idea you&rsquo;d rather float without owning. It goes straight to{" "}
          {recipients.map((r, i) => (
            <span key={r}>
              {i > 0 && (i === recipients.length - 1 ? " and " : ", ")}
              <span className="font-semibold text-[var(--bg-dark)]">{r}</span>
            </span>
          ))}
          , and nowhere else.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <AnonymousNoteForm />

        {/* The honesty panel.
            Every line here is checkable against the code, and it is written in
            what-we-do terms rather than promises, because the only version of
            this feature worth shipping is one where the claims are true. A
            member deciding whether to trust it deserves the real shape of it:
            what the email carries, what the portal keeps, and the one gap that
            remains. */}
        <aside className="rounded-2xl border border-[var(--border)] bg-[var(--bg-cream)]/50 p-5 text-sm">
          <h2 className="font-display text-base font-bold text-[var(--bg-dark)]">
            What actually happens
          </h2>

          <p className="mt-3 text-[13px] font-semibold text-[var(--bg-dark)]">The email carries</p>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-[var(--muted)]">
            <li>· what you wrote, and which of the four topics you picked</li>
            <li>· the time you sent it</li>
            <li>· whatever you typed in the contact box, if anything</li>
          </ul>

          <p className="mt-4 text-[13px] font-semibold text-[var(--bg-dark)]">
            It does not carry
          </p>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-relaxed text-[var(--muted)]">
            <li>· your name, email, role or year</li>
            <li>· which page you sent it from, or your device</li>
          </ul>

          <p className="mt-4 text-[13px] font-semibold text-[var(--bg-dark)]">
            The portal keeps no copy
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            Your note is not saved to any database. Once it&rsquo;s sent it exists in two inboxes
            and nowhere else — which also means we can&rsquo;t show it back to you.
          </p>

          <p className="mt-4 text-[13px] font-semibold text-[var(--bg-dark)]">
            The one thing we do record
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--muted)]">
            So this can&rsquo;t be used to flood two inboxes, the portal counts how many notes each
            account sends per hour. It stores a one-way hash of your address and the hour —
            not the address itself, and nothing connecting you to what you wrote. Someone with both
            the database and the server&rsquo;s secret key could work out that <em>an</em> account
            sent something in a given hour. That&rsquo;s the honest limit of it.
          </p>

          <p className="mt-4 border-t border-[var(--border)] pt-4 text-[13px] leading-relaxed text-[var(--muted)]">
            If what you need to report involves someone who reads this inbox, or you want it on the
            record outside the club, UIUC&rsquo;s{" "}
            <a
              href="https://wecare.illinois.edu/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--gold-deep)] hover:underline"
            >
              We Care
            </a>{" "}
            and the{" "}
            <a
              href="https://ethicspoint.illinois.edu/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[var(--gold-deep)] hover:underline"
            >
              University ethics line
            </a>{" "}
            exist for that and are not run by us.
          </p>
        </aside>
      </div>
    </div>
  );
}
