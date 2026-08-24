import type { Metadata } from "next";

import { AppBottomNav, SiteHeader } from "@/components/site-chrome";
import { NetworkGuard } from "@/components/wallet";

import { DarkSurface } from "./head-surface";

export const metadata: Metadata = {
  title: { default: "Savings", template: "%s · Serein" },
};

/**
 * The product surface.
 *
 * `data-surface="dark"` flips the body palette. DESIGN.md is explicit that product sections start on
 * the midnight surface and the marketing wash never appears behind them, so the switch happens once
 * here rather than being reapplied on every screen.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-midnight text-white">
      <DarkSurface />
      <SiteHeader surface="dark" />
      <main id="main" className="container-serein flex-1 py-8 md:py-12">
        <NetworkGuard>{children}</NetworkGuard>
      </main>
      <AppBottomNav />
    </div>
  );
}
