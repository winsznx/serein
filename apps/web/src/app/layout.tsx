import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { Providers } from "@/components/providers";

import "./globals.css";

/**
 * Inter stands in for the brand face. It is self-hosted by `next/font`, which matters twice over:
 * the CSP allows `font-src 'self'` with no third-party origin, and there is no render-blocking
 * request to a font CDN on first paint.
 *
 * Only 400 and 500 are loaded. The design system never goes heavier, so shipping 600+ would be dead
 * weight in the payload and an invitation to break the rule.
 */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://serein.app"),
  title: {
    default: "Serein — Private savings. Fair prizes.",
    template: "%s · Serein",
  },
  description:
    "Save private test USDC into a shared prize pool on Sepolia. Your balance and odds stay encrypted, your chance to win stays mathematically fair, and your principal stays withdrawable.",
  applicationName: "Serein",
  openGraph: {
    title: "Serein — Private savings. Fair prizes.",
    description:
      "Confidential no-loss prize savings with encrypted time-weighted balances and exact weighted draws.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#221d1d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Keyboard users should not have to tab through the whole nav on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-pill focus:bg-violet focus:px-5 focus:py-3 focus:text-small focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
