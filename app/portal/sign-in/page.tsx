import Image from "next/image";
import Link from "next/link";
import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;
  const session = await auth();
  if (session?.user?.email) redirect(callbackUrl || "/portal");

  return (
    <section className="min-h-[78vh] grid place-items-center px-4 py-16">
      <div className="w-full max-w-md rounded-3xl bg-white border border-[var(--border)] p-8 md:p-10 shadow-xl">
        <div className="flex items-center gap-3">
          <Image src="/cube-logo.png" alt="" width={48} height={48} className="w-12 h-12" />
          <div className="font-display font-extrabold tracking-[0.04em] leading-[1.02] text-[15px] text-[var(--bg-dark)]">
            <span className="block">CUBE</span>
            <span className="block">PORTAL</span>
          </div>
        </div>

        <h1 className="mt-7 font-display font-extrabold text-3xl text-[var(--bg-dark)]">
          Members only.
        </h1>
        <p className="mt-3 text-[var(--muted)] leading-relaxed">
          Sign in with your Google account to access the calendar, points tracker, and resources.
          Access is restricted to active CUBE consultants.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error === "AccessDenied"
              ? "Your Google account isn't on the CUBE roster. Reach out to leadership if this looks wrong."
              : "Sign-in failed. Please try again."}
          </p>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl || "/portal" });
          }}
          className="mt-7"
        >
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-3 rounded-full bg-[var(--bg-dark)] text-white font-semibold py-3.5 hover:bg-[var(--bg-dark-2)] transition-colors"
          >
            <GoogleGlyph />
            Sign in with Google
          </button>
        </form>

        <p className="mt-6 text-xs text-[var(--muted)] text-center">
          By signing in, you agree to access CUBE&apos;s internal resources for members-only use.
        </p>

        <Link
          href="/"
          className="mt-6 block text-center text-sm text-[var(--gold-deep)] hover:text-[var(--bg-dark)]"
        >
          ← Back to public site
        </Link>
      </div>
    </section>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.67-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.2 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
