"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import clsx from "clsx";

// The portal's mobile navigation.
//
// The portal header's <nav> is `hidden md:flex`, and until this existed there was
// nothing behind it: on a phone the portal showed a logo and a Sign out button
// and no way to reach any page. The public site had a mobile menu from the
// start (components/Header.tsx); the portal simply never got one.
//
// Split out as a client component because the links themselves are decided on
// the SERVER — which nav entries you get depends on your role and on the
// recruiting toggle, both of which need `auth()` and a Supabase read. So the
// layout stays a server component and hands the resolved list down, rather than
// shipping the role rules to the browser.

export type PortalNavLink = { href: string; label: string };

export function PortalMobileNav({ links }: { links: PortalNavLink[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close on navigation, or the panel stays open over the page you just opened.
  //
  // Adjusted during render rather than in an effect. The effect version — which
  // components/Header.tsx still uses — trips `react-hooks/set-state-in-effect`,
  // and it earns the warning: it renders the open panel once against the new
  // route before closing it, so the menu visibly flashes over the destination.
  // Resetting here means the first render of the new route is already closed.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        // min-h-11/min-w-11 keeps the tap target at 44px even though the icon is
        // 22px — the same floor the public header uses.
        className="md:hidden -mr-2 p-2 inline-flex items-center justify-center min-h-11 min-w-11 rounded-md text-[var(--fg-on-dark)] hover:text-[var(--gold)] focus-visible:outline-2 focus-visible:outline-[var(--gold)]"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="portal-mobile-menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="portal-mobile-menu"
            id="portal-mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            // `overflow-hidden` is load-bearing: without it the panel's contents
            // spill past the animated height and briefly widen the page, which
            // is the horizontal-overflow bug that hid the public navbar.
            className="md:hidden absolute inset-x-0 top-full border-t border-[var(--border-dark)] bg-[var(--bg-dark)] overflow-hidden"
          >
            <nav className="container-x py-4 flex flex-col" aria-label="Portal mobile">
              {links.map((link) => {
                // `startsWith` rather than equality, so /portal/strikes/new still
                // marks Strikes as current. Dashboard is exempt because every
                // portal path starts with /portal and it would always match.
                const active =
                  link.href === "/portal" ? pathname === "/portal" : pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "px-2 py-3 text-base tracking-wide border-b border-[var(--border-dark)] last:border-b-0",
                      active
                        ? "text-[var(--gold)]"
                        : "text-[var(--fg-on-dark)]/80 hover:text-[var(--gold)]"
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
