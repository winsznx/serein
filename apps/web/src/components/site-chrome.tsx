"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SereinWordmark } from "@/components/mark";
import { ButtonLink, cn } from "@/components/ui";
import { ConnectButton } from "@/components/wallet";

/**
 * Navigation for the marketing surface (light) and the product surface (dark).
 *
 * One component covers both because the structure is identical and only the palette flips — which
 * is exactly the dual-surface idea the design system is built on. Splitting it into two would let
 * the two halves drift.
 */

const MARKETING_LINKS = [
  { href: "/docs/how-it-works", label: "How it works" },
  { href: "/docs/privacy", label: "Privacy" },
  { href: "/proof", label: "Proof" },
  { href: "/docs/contracts", label: "Contracts" },
];

const APP_LINKS = [
  { href: "/app", label: "Savings" },
  { href: "/app/save", label: "Add" },
  { href: "/app/withdraw", label: "Take out" },
  { href: "/app/draws", label: "Draws" },
  { href: "/app/activity", label: "Activity" },
];

export function SiteHeader({ surface = "light" }: { surface?: "light" | "dark" }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Closing on navigation is an event, not a synchronisation: the menu closes because a link was
  // clicked. Doing it in an effect would schedule a second render for something the click already
  // knows.
  const close = (): void => setOpen(false);

  const dark = surface === "dark";
  const links = dark ? APP_LINKS : MARKETING_LINKS;

  const linkClass = (active: boolean): string =>
    cn(
      "rounded-badge px-3 py-2 text-small transition-colors",
      dark
        ? active
          ? "bg-white/10 text-white"
          : "text-white/65 hover:text-white"
        : active
          ? "bg-bone text-midnight"
          : "text-iron hover:text-midnight",
    );

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b backdrop-blur",
        dark ? "border-white/10 bg-midnight/85" : "border-ash/40 bg-paper/85",
      )}
    >
      <div className="container-serein flex h-16 items-center justify-between gap-4">
        <Link
          href={dark ? "/app" : "/"}
          className={cn("shrink-0", dark ? "text-white" : "text-midnight")}
        >
          <SereinWordmark />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={linkClass(pathname === link.href)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {dark ? (
            <ConnectButton tone="violet" />
          ) : (
            <ButtonLink href="/app" tone="dark" className="hidden sm:inline-flex">
              Open app
            </ButtonLink>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-badge md:hidden",
              dark ? "text-white hover:bg-white/10" : "text-midnight hover:bg-bone",
            )}
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

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className={cn(
            "border-t md:hidden",
            dark ? "border-white/10 bg-midnight" : "border-ash/40 bg-paper",
          )}
        >
          <div className="container-serein flex flex-col py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                onClick={close}
                className={cn("py-3 text-body", dark ? "text-white/85" : "text-midnight")}
              >
                {link.label}
              </Link>
            ))}
            {!dark ? (
              <ButtonLink href="/app" tone="dark" className="my-3" onClick={close} fullWidth>
                Open app
              </ButtonLink>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}

/**
 * Mobile bottom navigation for the product surface.
 *
 * A sidebar squeezed onto a phone is the tell of a desktop app pretending to be responsive. The
 * primary savings actions belong within thumb reach, and the proof view stays one tap away without
 * competing for space on the home screen.
 */
export function AppBottomNav() {
  const pathname = usePathname();

  const items = [
    { href: "/app", label: "Savings", icon: "M4 12h16M4 7h16M4 17h10" },
    { href: "/app/save", label: "Add", icon: "M12 5v14M5 12h14" },
    { href: "/app/withdraw", label: "Take out", icon: "M5 12h14" },
    { href: "/app/draws", label: "Draws", icon: "M12 4v8l5 3" },
    { href: "/proof", label: "Proof", icon: "M5 12l4 4 10-10" },
  ];

  return (
    <nav
      aria-label="App sections"
      className="sticky bottom-0 z-40 border-t border-white/10 bg-midnight/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="container-serein grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-caption",
                  active ? "text-violet" : "text-white/55",
                )}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d={item.icon}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteFooter({ surface = "dark" }: { surface?: "light" | "dark" }) {
  const dark = surface === "dark";
  const groups = [
    {
      title: "Product",
      links: [
        { href: "/app", label: "Open app" },
        { href: "/app/save", label: "Add savings" },
        { href: "/app/draws", label: "Draw history" },
      ],
    },
    {
      title: "Understand",
      links: [
        { href: "/docs/how-it-works", label: "How it works" },
        { href: "/docs/privacy", label: "What is public" },
        { href: "/docs/security", label: "Security model" },
      ],
    },
    {
      title: "Verify",
      links: [
        { href: "/proof", label: "Proof view" },
        { href: "/docs/contracts", label: "Live contracts" },
        { href: "https://github.com/winsznx/serein", label: "Source" },
      ],
    },
  ];

  return (
    <footer
      className={cn(
        "border-t",
        dark ? "border-white/10 bg-abyss text-white" : "border-ash/40 bg-bone text-midnight",
      )}
    >
      <div className="container-serein py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div className="space-y-4">
            <SereinWordmark />
            <p className={cn("max-w-xs text-small", dark ? "text-white/60" : "text-iron")}>
              Private savings. Fair prizes. Your balance and odds stay encrypted; your principal
              stays yours.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="space-y-3">
              <h3 className={cn("text-caption font-medium", dark ? "text-white/45" : "text-iron")}>
                {group.title}
              </h3>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    {link.href.startsWith("http") ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className={cn(
                          "text-small",
                          dark ? "text-white/75 hover:text-white" : "text-iron hover:text-midnight",
                        )}
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className={cn(
                          "text-small",
                          dark ? "text-white/75 hover:text-white" : "text-iron hover:text-midnight",
                        )}
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "mt-12 border-t pt-6 text-caption",
            dark ? "border-white/10 text-white/45" : "border-ash/40 text-iron",
          )}
        >
          <p>
            Sepolia testnet. Test tokens have no monetary value. Serein has not been independently
            audited. Nothing here is an offer, a return, or investment advice.
          </p>
        </div>
      </div>
    </footer>
  );
}
