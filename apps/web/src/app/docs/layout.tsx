import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s · Serein" },
};

const SECTIONS = [
  { href: "/docs/how-it-works", label: "How it works" },
  { href: "/docs/privacy", label: "What is public" },
  { href: "/docs/security", label: "Security model" },
  { href: "/docs/contracts", label: "Live contracts" },
];

/** Docs sit on the light surface — they are reading material, not product. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-midnight">
      <SiteHeader surface="light" />
      <div className="container-serein flex-1 py-10 md:py-16">
        <div className="grid gap-10 lg:grid-cols-[200px_1fr] lg:gap-16">
          <nav aria-label="Documentation" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
              {SECTIONS.map((section) => (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    className="block rounded-badge px-3 py-2 text-small text-iron hover:bg-bone hover:text-midnight"
                  >
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <main id="main" className="min-w-0 max-w-2xl">
            {children}
          </main>
        </div>
      </div>
      <SiteFooter surface="light" />
    </div>
  );
}
