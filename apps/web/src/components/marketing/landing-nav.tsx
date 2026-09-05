"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SereinWordmark } from "@/components/mark";
import { ButtonLink, cn } from "@/components/ui";

/**
 * The landing page's own nav — transparent over the hero, a floating capsule once the reader scrolls.
 *
 * This intentionally does not touch `SiteHeader`, which every other route still uses. The floating
 * treatment only makes sense over a light hero wash with room behind it; forcing it onto the app and
 * docs surfaces would be a change nobody asked for.
 */

const LINKS = [
  { href: "/docs/how-it-works", label: "How it works" },
  { href: "/docs/privacy", label: "Privacy" },
  { href: "/proof", label: "Proof" },
  { href: "/docs/contracts", label: "Contracts" },
];

export function LandingNav() {
  const [floating, setFloating] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = (): void => setFloating(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = (): void => setOpen(false);

  return (
    <header className="sticky top-0 z-40">
      <div className={cn("transition-[padding] duration-300", floating ? "px-3 pt-3 md:px-4" : "")}>
        <div
          className={cn(
            "container-serein flex h-16 items-center justify-between gap-4 rounded-pill px-4 transition-all duration-300 md:px-6",
            floating
              ? "border border-ash/50 bg-paper/90 shadow-[var(--shadow-float)] backdrop-blur"
              : "border border-transparent bg-transparent",
          )}
        >
          <Link href="/" className="shrink-0 text-midnight">
            <SereinWordmark />
          </Link>

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-badge px-3 py-2 text-small text-iron transition-colors hover:text-midnight"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ButtonLink href="/app" tone="dark" size="md" className="hidden sm:inline-flex">
              Open app
            </ButtonLink>

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="landing-mobile-nav"
              className="inline-flex h-11 w-11 items-center justify-center rounded-badge text-midnight hover:bg-bone md:hidden"
            >
              <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                {open ? (
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d="M3 6h14M3 10h14M3 14h14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <nav
          id="landing-mobile-nav"
          aria-label="Primary"
          className="mx-3 mt-2 rounded-card border border-ash/50 bg-paper shadow-[var(--shadow-float)] md:hidden"
        >
          <div className="flex flex-col px-5 py-2">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={close}
                className="min-h-11 py-3 text-body text-midnight"
              >
                {link.label}
              </Link>
            ))}
            <ButtonLink href="/app" tone="dark" className="my-3" onClick={close} fullWidth>
              Open app
            </ButtonLink>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
