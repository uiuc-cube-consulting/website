"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import clsx from "clsx";
import { NAV_LINKS } from "@/lib/content";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 w-full bg-[var(--bg-dark)] text-[var(--fg-on-dark)]">
      <div className="container-x flex h-20 md:h-24 items-center justify-between gap-6">
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
            className="w-10 h-10 md:w-12 md:h-12 transition-transform duration-200 group-hover:rotate-6"
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
          className="md:hidden -mr-2 p-2 rounded-md text-[var(--fg-on-dark)] hover:text-[var(--gold)]"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-[var(--border-dark)]">
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
                    active ? "text-[var(--gold)]" : "text-[var(--fg-on-dark)]/80 hover:text-[var(--gold)]"
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
        </div>
      )}
    </header>
  );
}
