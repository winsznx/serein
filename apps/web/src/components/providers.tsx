"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, useAccount, useChainId } from "wagmi";

import { clearRevealedValues } from "@/lib/fhe/reveal";
import { resetFheInstance } from "@/lib/fhe/sdk";
import { wagmiConfig } from "@/lib/wagmi";

/**
 * Drop every decrypted value the moment the wallet or the chain changes.
 *
 * Without this, switching accounts would leave the previous account's balance on screen — visually
 * attributed to the new one. That is the kind of bug that turns a privacy product into a
 * misinformation product, so it is handled at the provider level rather than per screen.
 */
function RevealLifecycle({ children }: { children: ReactNode }) {
  const { address, status } = useAccount();
  const chainId = useChainId();

  useEffect(() => {
    clearRevealedValues();
    resetFheInstance();
  }, [address, chainId, status]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
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
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RevealLifecycle>{children}</RevealLifecycle>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
