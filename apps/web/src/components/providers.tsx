"use client";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { WagmiProvider, type State, useAccount, useChainId } from "wagmi";

import { clearRevealedValues } from "@/lib/fhe/reveal";
import { resetFheInstance } from "@/lib/fhe/sdk";
import { wagmiConfig } from "@/lib/wagmi";

import "@rainbow-me/rainbowkit/styles.css";

/**
 * RainbowKit, wearing Serein's design system rather than its own.
 *
 * The modal is the one part of the product a user did not see us build, so it is the fastest place
 * to look imported. Matching the accent, the pill radius and the surface colours is what keeps it
 * feeling like the same application.
 */
const sereinTheme = darkTheme({
  accentColor: "#998eff",
  accentColorForeground: "#ffffff",
  borderRadius: "large",
  fontStack: "system",
  overlayBlur: "small",
});

const theme = {
  ...sereinTheme,
  colors: {
    ...sereinTheme.colors,
    modalBackground: "#221d1d",
    modalBorder: "rgba(255,255,255,0.10)",
    profileForeground: "#0f0f10",
    menuItemBackground: "rgba(255,255,255,0.06)",
    generalBorder: "rgba(255,255,255,0.10)",
  },
  radii: { ...sereinTheme.radii, actionButton: "9999px", connectButton: "9999px" },
};

/**
 * Drop every decrypted value when the wallet or chain changes — but not while reconnecting.
 *
 * The distinction matters. On a refresh, wagmi passes through `reconnecting` before landing on the
 * same address it had before. Treating that transition as a change would clear a perfectly valid
 * session on every page load. What must be cleared is a genuine switch to a *different* account,
 * because leaving the previous account's balance on screen would attribute it to the new one — the
 * kind of bug that turns a privacy product into a misinformation product.
 */
function RevealLifecycle({ children }: { children: ReactNode }) {
  const { address, status } = useAccount();
  const chainId = useChainId();
  const previous = useRef<{ address?: string; chainId?: number } | null>(null);

  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") return;

    const current = { address, chainId };
    const before = previous.current;
    previous.current = current;

    if (before === null) return;
    if (before.address === current.address && before.chainId === current.chainId) return;

    clearRevealedValues();
    resetFheInstance();
  }, [address, chainId, status]);

  return <>{children}</>;
}

export function Providers({
  children,
  initialState,
}: {
  children: ReactNode;
  /** Connection state recovered from the request cookie, so the first paint is already correct. */
  initialState?: State | undefined;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain state moves in blocks, not milliseconds. Refetching harder than this burns RPC
            // budget without telling the reader anything new.
            staleTime: 8_000,
            refetchInterval: 12_000,
            refetchOnWindowFocus: true,
            retry: 2,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} modalSize="compact" showRecentTransactions={false}>
          <RevealLifecycle>{children}</RevealLifecycle>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
