import type { Metadata } from "next";

import { SiteFooter, SiteHeader } from "@/components/site-chrome";

export const metadata: Metadata = {
  title: { default: "Proof", template: "%s · Serein proof" },
  description:
    "Verify Serein's confidentiality and fairness claims against live Sepolia state: what is published, what stays encrypted, and which transaction proves each step.",
};

export default function ProofLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-midnight text-white">
      <SiteHeader surface="dark" />
      <main id="main" className="container-serein flex-1 py-10 md:py-14">
        {children}
      </main>
      <SiteFooter surface="dark" />
    </div>
  );
}
