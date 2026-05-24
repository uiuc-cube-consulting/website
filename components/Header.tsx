"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { NAV_LINKS } from "@/lib/content";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={clsx(
        "sticky top-0 z-50 w-full text-[var(--fg-on-dark)] transition-[background-color,backdrop-filter,box-shadow,border-color] duration-300",
        scrolled
          ? "bg-[rgba(21,17,11,0.78)] backdrop-blur-md border-b border-[var(--border-dark)] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
          : "bg-[var(--bg-dark)] border-b border-transparent"
      )}
    >
      <div
        className={clsx(
          "container-x flex items-center justify-between gap-6 transition-[height] duration-300",
          scrolled ? "h-16 md:h-18" : "h-20 md:h-24"
        )}
      >
        <Link
          href="/"
          aria-label="CUBE Consulting home"
          className="flex items-center gap-3 md:gap-4 group"
        >
          <Image
            src="/cube-logo.png"
            alt=""
            width={48}
            height={48}
            priority
            className={clsx(
              "transition-all duration-300 group-hover:rotate-6",
              scrolled ? "w-9 h-9 md:w-10 md:h-10" : "w-10 h-10 md:w-12 md:h-12"
            )}
          />
          <span className="font-display font-extrabold leading-[1.02] tracking-[0.04em] text-[15px] md:text-[18px]">
            <span className="block">CUBE</span>
            <span className="block">CONSULTING</span>
          </span>
        </Link>

        <nav
          className="hidden md:flex items-center gap-7 lg:gap-10 text-[15px]"
          aria-label="Primary"
        >
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className="nav-link"
              >
                {link.label}
              </Link>
            );
          })}
          <Link
            href="/portal"
            className="ml-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-[var(--gold)]/55 text-[var(--gold)] hover:bg-[var(--gold)] hover:text-[var(--bg-dark)] text-xs font-semibold tracking-wider uppercase transition-colors"
          >
            Member Portal
          </Link>
        </nav>

        <button
          type="button"
          className="md:hidden -mr-2 p-2 rounded-md text-[var(--fg-on-dark)] hover:text-[var(--gold)] focus-visible:outline-2 focus-visible:outline-[var(--gold)]"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="md:hidden border-t border-[var(--border-dark)] overflow-hidden"
          >
            <nav className="container-x py-4 flex flex-col" aria-label="Mobile">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href;
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
              <Link
                href="/portal"
                className="mt-3 inline-flex justify-center px-4 py-2.5 rounded-full bg-[var(--gold)] text-[var(--bg-dark)] font-semibold text-sm tracking-wide"
              >
                Member Portal
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
